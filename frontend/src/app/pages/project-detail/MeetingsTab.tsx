import React, { useState, useEffect } from "react";
import { Video, Calendar, Clock, Users, Download, RefreshCw, X, Loader2 } from "lucide-react";
import { Meeting, MeetingDetail, InviteeAttendance, Participant, Recording } from "../../types";
import { Dlg } from "../../components/Dlg";
import { getProjectMeetings, getMeeting, syncMeeting, cancelMeeting, downloadRecording } from "../../api/meetings";

interface MeetingsTabProps {
  projectId: number;
  canScheduleMeeting: boolean;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(minutes: number | null) {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function fmtDurationSeconds(seconds: number) {
  if (!seconds) return "0 min";
  const minutes = Math.floor(seconds / 60);
  return fmtDuration(minutes);
}

const STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-slate-100 text-slate-600 border-slate-200",
  Started: "bg-blue-50 text-blue-700 border-blue-200",
  Ended: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};

function MeetingStatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
    >
      {status}
    </span>
  );
}

export function MeetingsTab({ projectId, canScheduleMeeting }: MeetingsTabProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, [projectId]);

  async function loadMeetings() {
    setLoading(true);
    try {
      const data = await getProjectMeetings(projectId);
      setMeetings(data);
    } catch (err: any) {
      console.error("Failed to load meetings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(meeting: Meeting) {
    setShowDetail(true);
    setDetailLoading(true);
    setSyncError(null);
    try {
      const detail = await getMeeting(meeting.id);
      setSelectedMeeting(detail);
    } catch (err: any) {
      console.error("Failed to load meeting detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSync() {
    if (!selectedMeeting) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await syncMeeting(selectedMeeting.id);
      // Reload detail
      const detail = await getMeeting(selectedMeeting.id);
      setSelectedMeeting(detail);
      // Reload list
      await loadMeetings();
    } catch (err: any) {
      if (err.status === 409) {
        setSyncError("Zoom hasn't finished processing, try again in a few minutes");
      } else {
        setSyncError(err.message || "Failed to sync attendance");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleCancel() {
    if (!selectedMeeting) return;
    setCancelling(true);
    try {
      await cancelMeeting(selectedMeeting.id);
      setShowDetail(false);
      setSelectedMeeting(null);
      await loadMeetings();
    } catch (err: any) {
      console.error("Failed to cancel meeting:", err);
    } finally {
      setCancelling(false);
    }
  }

  async function handleDownloadRecording(recording: Recording) {
    try {
      await downloadRecording(recording.id);
    } catch (err: any) {
      console.error("Failed to download recording:", err);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Meetings</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground text-center py-8">Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No meetings scheduled yet
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                onClick={() => openDetail(meeting)}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Video size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-foreground">{meeting.title}</h3>
                    <MeetingStatusBadge status={meeting.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      <span>{fmtDateTime(meeting.scheduledStart)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{fmtDuration(meeting.durationMinutes)}</span>
                    </div>
                    {meeting.actualDurationMinutes && (
                      <div className="flex items-center gap-1">
                        <span>Actual: {fmtDuration(meeting.actualDurationMinutes)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Users size={12} />
                    <span>{meeting.attendedCount} of {meeting.inviteeCount} invited attended</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDetail && selectedMeeting && (
        <Dlg
          title={selectedMeeting.title}
          onClose={() => {
            setShowDetail(false);
            setSelectedMeeting(null);
            setSyncError(null);
          }}
          size="xl"
        >
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Meeting Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <MeetingStatusBadge status={selectedMeeting.status} className="ml-2" />
                </div>
                <div>
                  <span className="text-muted-foreground">Scheduled:</span>
                  <span className="ml-2 text-foreground">{fmtDateTime(selectedMeeting.scheduledStart)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="ml-2 text-foreground">{fmtDuration(selectedMeeting.durationMinutes)}</span>
                </div>
                {selectedMeeting.actualDurationMinutes && (
                  <div>
                    <span className="text-muted-foreground">Actual:</span>
                    <span className="ml-2 text-foreground">{fmtDuration(selectedMeeting.actualDurationMinutes)}</span>
                  </div>
                )}
                {selectedMeeting.agenda && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Agenda:</span>
                    <p className="mt-1 text-foreground">{selectedMeeting.agenda}</p>
                  </div>
                )}
              </div>

              {/* Invitees */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Invitees</h4>
                {selectedMeeting.invitees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invitees</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground">Name</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Attended</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">First Joined</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Last Left</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Total Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMeeting.invitees.map((invitee) => (
                          <tr key={invitee.userId} className="border-t border-border">
                            <td className="px-3 py-2 text-foreground">{invitee.name}</td>
                            <td className="px-3 py-2">
                              {invitee.attended ? (
                                <span className="text-emerald-600">Yes</span>
                              ) : (
                                <span className="text-muted-foreground">No</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(invitee.firstJoined)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(invitee.lastLeft)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDurationSeconds(invitee.totalDurationSeconds)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Other Participants */}
              {selectedMeeting.participants.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Other Participants (Guests)</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground">Name</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Email</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">First Joined</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Last Left</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Total Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMeeting.participants.map((participant) => (
                          <tr key={participant.id} className="border-t border-border">
                            <td className="px-3 py-2 text-foreground">{participant.name || "Unknown"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{participant.email || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(participant.joinTime)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(participant.leaveTime)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDurationSeconds(participant.durationSeconds || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recordings */}
              {selectedMeeting.recordings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Recordings</h4>
                  <div className="space-y-2">
                    {selectedMeeting.recordings.map((recording) => (
                      <div
                        key={recording.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="text-sm text-foreground">{recording.recordingType || "Recording"}</div>
                          <div className="text-xs text-muted-foreground">
                            {recording.fileSizeBytes ? `${(recording.fileSizeBytes / 1024 / 1024).toFixed(2)} MB` : "Unknown size"}
                          </div>
                        </div>
                        {recording.playUrl && (
                          <a
                            href={recording.playUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 text-sm cursor-pointer mr-2"
                          >
                            Play
                          </a>
                        )}
                        <button
                          onClick={() => handleDownloadRecording(recording)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Download size={14} />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions for schedulers */}
              {canScheduleMeeting && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    {syncError && (
                      <p className="text-sm text-red-600">{syncError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedMeeting.status === "Scheduled" && (
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        Cancel Meeting
                      </button>
                    )}
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Refresh Attendance
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Dlg>
      )}
    </>
  );
}
