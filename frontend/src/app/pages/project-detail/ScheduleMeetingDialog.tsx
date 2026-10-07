import React, { useState } from "react";
import { Dlg } from "../../components/Dlg";
import { FldInput } from "../../components/FldInput";
import { DatePicker } from "../../components/DatePicker";
import { UserType } from "../../types";

interface ScheduleMeetingDialogProps {
  project: any;
  teamMembers: UserType[];
  currentUser: UserType | null;
  onClose: () => void;
  onCreateMeeting: (data: any) => Promise<void>;
  setError: (error: string | null) => void;
}

interface MeetingForm {
  title: string;
  agenda: string;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  recordingEnabled: boolean;
  inviteeIds: number[];
}

export function ScheduleMeetingDialog({
  project,
  teamMembers,
  currentUser,
  onClose,
  onCreateMeeting,
  setError,
}: ScheduleMeetingDialogProps) {
  const [form, setForm] = useState<MeetingForm>({
    title: "",
    agenda: "",
    startTime: "",
    durationMinutes: 30,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recordingEnabled: true,
    inviteeIds: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter invitees to only team members + lead
  const eligibleInvitees = [...teamMembers];

  function toggleInvitee(userId: number) {
    setForm((prev) => ({
      ...prev,
      inviteeIds: prev.inviteeIds.includes(userId)
        ? prev.inviteeIds.filter((id) => id !== userId)
        : [...prev.inviteeIds, userId],
    }));
  }

  function toggleAllInvitees() {
    const allIds = eligibleInvitees.map((u) => u.id);
    setForm((prev) => ({
      ...prev,
      inviteeIds: prev.inviteeIds.length === allIds.length ? [] : allIds,
    }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (form.title.length < 1 || form.title.length > 200) {
      setError("Title must be between 1 and 200 characters");
      return;
    }
    if (!form.startTime) {
      setError("Start time is required");
      return;
    }
    if (new Date(form.startTime) <= new Date()) {
      setError("Start time must be in the future");
      return;
    }
    if (form.durationMinutes < 5 || form.durationMinutes > 480) {
      setError("Duration must be between 5 and 480 minutes");
      return;
    }
    if (form.inviteeIds.length === 0) {
      setError("At least one invitee is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateMeeting(form);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create meeting");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dlg title="Schedule Meeting" onClose={onClose} size="lg">
      <div className="space-y-4">
        <FldInput
          label="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Meeting title"
          autoFocus
          maxLength={200}
        />

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Agenda
          </label>
          <textarea
            value={form.agenda}
            onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
            placeholder="Meeting agenda (optional)"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-muted-foreground/60 text-foreground min-h-[80px] resize-y"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DatePicker
            label="Start Time"
            value={form.startTime}
            onChange={(value) => setForm((f) => ({ ...f, startTime: value }))}
            min={new Date().toISOString().slice(0, 16)}
          />
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Duration (minutes)
            </label>
            <input
              type="number"
              value={form.durationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value) || 30 }))}
              min={5}
              max={480}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Timezone
          </label>
          <input
            type="text"
            value={form.timezone}
            readOnly
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="recording"
            checked={form.recordingEnabled}
            onChange={(e) => setForm((f) => ({ ...f, recordingEnabled: e.target.checked }))}
            className="w-4 h-4 border border-border rounded"
          />
          <label htmlFor="recording" className="text-sm text-foreground cursor-pointer">
            Record this meeting
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Invitees
            </label>
            <button
              type="button"
              onClick={toggleAllInvitees}
              className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {form.inviteeIds.length === eligibleInvitees.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
            {eligibleInvitees.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.inviteeIds.includes(user.id)}
                  onChange={() => toggleInvitee(user.id)}
                  className="w-4 h-4 border border-border rounded"
                />
                <span className="text-sm text-foreground">{user.name}</span>
                {user.email && <span className="text-xs text-muted-foreground">({user.email})</span>}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating..." : "Schedule Meeting"}
        </button>
      </div>
    </Dlg>
  );
}
