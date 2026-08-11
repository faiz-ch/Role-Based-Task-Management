import React, { useState } from "react";
import { Plus, Edit2, Trash2, Calendar } from "lucide-react";
import { Project, Milestone } from "../../types";
import { Dlg } from "../../components/Dlg";
import { FldSelect } from "../../components/FldSelect";
import { DatePicker } from "../../components/DatePicker";

interface MilestonesTabProps {
  project: Project;
  milestones: Milestone[];
  onCreateMilestone: (milestoneData: any) => Promise<void>;
  onUpdateMilestone: (milestoneId: number, milestoneData: any) => Promise<void>;
  onDeleteMilestone: (milestoneId: number) => Promise<void>;
}

interface MilestoneForm {
  title: string;
  description: string;
  dueDate: string;
  status: string;
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

const MILESTONE_STATUSES = ["Planned", "In Progress", "Completed", "Delayed"];

const STATUS_COLORS: Record<string, string> = {
  Planned: "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Delayed: "bg-amber-50 text-amber-700 border-amber-200",
};

function MilestoneStatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
    >
      {status}
    </span>
  );
}

export function MilestonesTab({ 
  project, 
  milestones, 
  onCreateMilestone, 
  onUpdateMilestone, 
  onDeleteMilestone 
}: MilestonesTabProps) {
  const [showNewMilestone, setShowNewMilestone] = useState(false);
  const [showEditMilestone, setShowEditMilestone] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm>({
    title: "",
    description: "",
    dueDate: "",
    status: "Planned",
  });

  async function handleCreateMilestone() {
    if (!milestoneForm.title.trim()) return;
    try {
      await onCreateMilestone(milestoneForm);
      setShowNewMilestone(false);
      setMilestoneForm({
        title: "",
        description: "",
        dueDate: "",
        status: "Planned",
      });
    } catch (err: any) {
      console.error("Failed to create milestone:", err);
    }
  }

  async function handleUpdateMilestone() {
    if (!selectedMilestone || !milestoneForm.title.trim()) return;
    try {
      await onUpdateMilestone(selectedMilestone.id, milestoneForm);
      setShowEditMilestone(false);
      setSelectedMilestone(null);
    } catch (err: any) {
      console.error("Failed to update milestone:", err);
    }
  }

  async function handleDeleteMilestone() {
    if (!selectedMilestone) return;
    try {
      await onDeleteMilestone(selectedMilestone.id);
      setShowDeleteConfirm(false);
      setSelectedMilestone(null);
    } catch (err: any) {
      console.error("Failed to delete milestone:", err);
    }
  }

  function openNewMilestone() {
    setMilestoneForm({
      title: "",
      description: "",
      dueDate: "",
      status: "Planned",
    });
    setShowNewMilestone(true);
  }

  function openEditMilestone(milestone: Milestone) {
    setSelectedMilestone(milestone);
    setMilestoneForm({
      title: milestone.title,
      description: milestone.description || "",
      dueDate: milestone.dueDate || "",
      status: milestone.status,
    });
    setShowEditMilestone(true);
  }

  function openDeleteConfirm(milestone: Milestone) {
    setSelectedMilestone(milestone);
    setShowDeleteConfirm(true);
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Milestones</h2>
          <button
            onClick={openNewMilestone}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1022] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer"
          >
            <Plus size={12} /> New Milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No milestones yet
          </div>
        ) : (
          <div className="space-y-3">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-foreground">{milestone.title}</h3>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>
                  {milestone.description && (
                    <p className="text-xs text-muted-foreground mb-2">{milestone.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar size={12} />
                    <span>Due: {fmtDate(milestone.dueDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditMilestone(milestone)}
                    className="p-1.5 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Edit milestone"
                  >
                    <Edit2 size={14} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => openDeleteConfirm(milestone)}
                    className="p-1.5 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Delete milestone"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewMilestone && (
        <Dlg title="New Milestone" onClose={() => setShowNewMilestone(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={milestoneForm.title}
                onChange={(e) => setMilestoneForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={milestoneForm.description}
                onChange={(e) => setMilestoneForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker
                label="Due Date"
                value={milestoneForm.dueDate}
                onChange={(value) => setMilestoneForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
                max={project?.dueDate ? project.dueDate.slice(0, 16) : undefined}
              />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                <select
                  value={milestoneForm.status}
                  onChange={(e) => setMilestoneForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  {MILESTONE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowNewMilestone(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateMilestone}
              disabled={!milestoneForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Milestone
            </button>
          </div>
        </Dlg>
      )}

      {showEditMilestone && selectedMilestone && (
        <Dlg title="Edit Milestone" onClose={() => setShowEditMilestone(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
              <input
                type="text"
                value={milestoneForm.title}
                onChange={(e) => setMilestoneForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={milestoneForm.description}
                onChange={(e) => setMilestoneForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400 min-h-[80px] resize-y"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker
                label="Due Date"
                value={milestoneForm.dueDate}
                onChange={(value) => setMilestoneForm((f) => ({ ...f, dueDate: value }))}
                min={new Date().toISOString().slice(0, 16)}
                max={project?.dueDate ? project.dueDate.slice(0, 16) : undefined}
              />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                <select
                  value={milestoneForm.status}
                  onChange={(e) => setMilestoneForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:border-blue-400"
                >
                  {MILESTONE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowEditMilestone(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateMilestone}
              disabled={!milestoneForm.title.trim()}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </Dlg>
      )}

      {showDeleteConfirm && selectedMilestone && (
        <Dlg title="Delete milestone" onClose={() => setShowDeleteConfirm(false)}>
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete this milestone? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMilestone}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </Dlg>
      )}
    </>
  );
}