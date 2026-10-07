import { apiFetch, getAccessToken } from "./client";
import { Meeting, MeetingDetail, InviteeAttendance, Participant, Recording } from "../types";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapMeeting(m: any): Meeting {
  return {
    id: m.id,
    projectId: m.project_id,
    title: m.title,
    agenda: m.agenda || null,
    scheduledStart: m.scheduled_start,
    durationMinutes: m.duration_minutes,
    timezone: m.timezone,
    status: m.status,
    recordingEnabled: m.recording_enabled,
    joinUrl: m.join_url || null,
    actualStart: m.actual_start || null,
    actualEnd: m.actual_end || null,
    actualDurationMinutes: m.actual_duration_minutes || null,
    createdAt: m.created_at,
    cancelledAt: m.cancelled_at || null,
    inviteeCount: m.invitee_count,
    attendedCount: m.attended_count,
  };
}

function mapInviteeAttendance(i: any): InviteeAttendance {
  return {
    userId: i.user_id,
    name: i.name,
    email: i.email,
    attended: i.attended,
    firstJoined: i.first_joined || null,
    lastLeft: i.last_left || null,
    totalDurationSeconds: i.total_duration_seconds,
  };
}

function mapParticipant(p: any): Participant {
  return {
    id: p.id,
    userId: p.user_id || null,
    name: p.name || null,
    email: p.email || null,
    joinTime: p.join_time || null,
    leaveTime: p.leave_time || null,
    durationSeconds: p.duration_seconds || null,
  };
}

function mapRecording(r: any): Recording {
  return {
    id: r.id,
    zoomFileId: r.zoom_file_id,
    fileType: r.file_type || null,
    recordingType: r.recording_type || null,
    fileSizeBytes: r.file_size_bytes || null,
    playUrl: r.play_url || null,
    recordingStart: r.recording_start || null,
    recordingEnd: r.recording_end || null,
    createdAt: r.created_at,
  };
}

function mapMeetingDetail(m: any): MeetingDetail {
  return {
    id: m.id,
    projectId: m.project_id,
    title: m.title,
    agenda: m.agenda || null,
    scheduledStart: m.scheduled_start,
    durationMinutes: m.duration_minutes,
    timezone: m.timezone,
    status: m.status,
    recordingEnabled: m.recording_enabled,
    joinUrl: m.join_url || null,
    actualStart: m.actual_start || null,
    actualEnd: m.actual_end || null,
    actualDurationMinutes: m.actual_duration_minutes || null,
    createdAt: m.created_at,
    cancelledAt: m.cancelled_at || null,
    invitees: Array.isArray(m.invitees) ? m.invitees.map(mapInviteeAttendance) : [],
    participants: Array.isArray(m.participants) ? m.participants.map(mapParticipant) : [],
    recordings: Array.isArray(m.recordings) ? m.recordings.map(mapRecording) : [],
  };
}

export async function getProjectMeetings(projectId: number): Promise<Meeting[]> {
  const data = await apiFetch(`/meetings/projects/${projectId}/meetings`);
  return Array.isArray(data) ? data.map(mapMeeting) : [];
}

export async function getMeeting(meetingId: number): Promise<MeetingDetail> {
  const data = await apiFetch(`/meetings/${meetingId}`);
  return mapMeetingDetail(data);
}

export async function createMeeting(projectId: number, input: {
  title: string;
  agenda?: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  recordingEnabled?: boolean;
  inviteeIds: number[];
}): Promise<Meeting> {
  const payload: any = {
    title: input.title,
    agenda: input.agenda || null,
    start_time: new Date(input.startTime).toISOString(),
    duration_minutes: input.durationMinutes,
    timezone: input.timezone,
    recording_enabled: input.recordingEnabled !== undefined ? input.recordingEnabled : true,
    invitee_ids: input.inviteeIds,
  };
  const data = await apiFetch(`/meetings/projects/${projectId}/meetings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapMeeting(data);
}

export async function syncMeeting(meetingId: number): Promise<void> {
  await apiFetch(`/meetings/${meetingId}/sync`, {
    method: "POST",
  });
}

export async function cancelMeeting(meetingId: number): Promise<void> {
  await apiFetch(`/meetings/${meetingId}`, {
    method: "DELETE",
  });
}

export async function downloadRecording(recordingId: number): Promise<void> {
  const token = getAccessToken();
  const url = `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}/meetings/recordings/${recordingId}/download`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const errData = text ? JSON.parse(text) : null;
    throw new Error(errData?.detail || "Failed to download recording");
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `recording_${recordingId}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
