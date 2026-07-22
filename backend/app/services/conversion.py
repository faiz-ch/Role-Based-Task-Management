"""
Talks to the Gotenberg container over HTTP to convert office documents
(docx/xlsx/pptx) into PDFs, so they can be previewed in-browser the same
way a real PDF can.
"""
import httpx

from app.config import settings


async def convert_to_pdf(file_bytes: bytes, filename: str) -> bytes:
    url = f"{settings.GOTENBERG_URL}/forms/libreoffice/convert"

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            files={"file": (filename, file_bytes)},
        )
        response.raise_for_status()
        return response.content