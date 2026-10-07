"""
Zoom API service for managing meetings, participants, and recordings.
Uses Server-to-Server OAuth with in-memory token caching.
"""
import asyncio
import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class ZoomError(Exception):
    """Custom error for Zoom API failures."""
    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        self.message = message
        self.status_code = status_code
        self.code = code
        super().__init__(message)


class ZoomClient:
    """Zoom API client with OAuth token caching."""

    def __init__(self):
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None
        self._lock = asyncio.Lock()

    async def _get_token(self) -> str:
        """Get or refresh the access token."""
        async with self._lock:
            now = datetime.now(timezone.utc)
            if self._access_token and self._token_expires_at and now < self._token_expires_at - timedelta(minutes=1):
                return self._access_token

            if not settings.ZOOM_ACCOUNT_ID or not settings.ZOOM_CLIENT_ID or not settings.ZOOM_CLIENT_SECRET:
                raise ZoomError("Zoom not configured", status_code=503)

            auth_string = base64.b64encode(
                f"{settings.ZOOM_CLIENT_ID}:{settings.ZOOM_CLIENT_SECRET}".encode()
            ).decode()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://zoom.us/oauth/token",
                    params={
                        "grant_type": "account_credentials",
                        "account_id": settings.ZOOM_ACCOUNT_ID,
                    },
                    headers={
                        "Authorization": f"Basic {auth_string}",
                    },
                )
                if response.status_code != 200:
                    raise ZoomError(
                        f"Failed to get Zoom token: {response.text}",
                        status_code=response.status_code,
                    )

                data = response.json()
                self._access_token = data["access_token"]
                expires_in = data.get("expires_in", 3600)
                self._token_expires_at = now + timedelta(seconds=expires_in)
                return self._access_token

    async def create_meeting(
        self,
        host_email: str,
        title: str,
        start_time: datetime,
        duration_minutes: int,
        agenda: str | None = None,
        recording_enabled: bool = True,
        join_before_host: bool = False,
        waiting_room: bool = True,
    ) -> dict[str, Any]:
        """Create a Zoom meeting."""
        token = await self._get_token()

        payload = {
            "topic": title,
            "type": 2,  # Scheduled meeting
            "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration": duration_minutes,
            "timezone": "UTC",
            "agenda": agenda or "",
            "settings": {
                "auto_recording": "cloud" if recording_enabled else "none",
                "mute_upon_entry": True,
                "join_before_host": join_before_host,
                "waiting_room": waiting_room,
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.zoom.us/v2/users/{host_email}/meetings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if response.status_code == 404:
                raise ZoomError(
                    f"Zoom user not found: {host_email}",
                    status_code=404,
                    code="1001",
                )

            if response.status_code != 201:
                raise ZoomError(
                    f"Failed to create Zoom meeting: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            return {
                "id": data["id"],
                "uuid": data["uuid"],
                "join_url": data["join_url"],
            }

    async def delete_meeting(self, meeting_id: int) -> None:
        """Delete a Zoom meeting. Treat 404 as success."""
        token = await self._get_token()

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                },
            )

            if response.status_code not in (204, 404):
                raise ZoomError(
                    f"Failed to delete Zoom meeting: {response.text}",
                    status_code=response.status_code,
                )

    async def get_past_participants(self, meeting_uuid: str) -> list[dict[str, Any]]:
        """Get participants for a past meeting, handling pagination."""
        token = await self._get_token()

        # Double URL-encode the uuid if it starts with / or contains //
        encoded_uuid = meeting_uuid
        if meeting_uuid.startswith("/") or "//" in meeting_uuid:
            encoded_uuid = quote(quote(meeting_uuid, safe=""), safe="")

        participants = []
        next_page_token = ""

        async with httpx.AsyncClient() as client:
            while True:
                params = {"page_size": "300"}
                if next_page_token:
                    params["next_page_token"] = next_page_token

                response = await client.get(
                    f"https://api.zoom.us/v2/past_meetings/{encoded_uuid}/participants",
                    headers={
                        "Authorization": f"Bearer {token}",
                    },
                    params=params,
                )

                if response.status_code == 404:
                    # Meeting data not ready yet
                    raise ZoomError(
                        "Zoom hasn't finished processing the meeting data",
                        status_code=409,
                    )

                if response.status_code != 200:
                    raise ZoomError(
                        f"Failed to get Zoom participants: {response.text}",
                        status_code=response.status_code,
                    )

                data = response.json()
                participants.extend(data.get("participants", []))
                next_page_token = data.get("next_page_token", "")

                if not next_page_token:
                    break

        return participants

    async def stream_recording(self, download_url: str):
        """Stream a recording download from Zoom."""
        token = await self._get_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                download_url,
                headers={
                    "Authorization": f"Bearer {token}",
                },
                follow_redirects=True,
            )

            if response.status_code != 200:
                raise ZoomError(
                    f"Failed to stream Zoom recording: {response.text}",
                    status_code=response.status_code,
                )

            return response.aiter_bytes()


# Global client instance
_zoom_client = ZoomClient()


def get_zoom_client() -> ZoomClient:
    """Get the global Zoom client instance."""
    return _zoom_client


def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Zoom webhook signature."""
    if not settings.ZOOM_WEBHOOK_SECRET_TOKEN:
        return False

    message = f"v0:{timestamp}:{raw_body.decode('utf-8')}"
    expected_signature = "v0=" + hmac.new(
        settings.ZOOM_WEBHOOK_SECRET_TOKEN.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)
