import React, { useState } from "react";
import { Users, UserCheck } from "lucide-react";
import { Project, UserType } from "../../types";
import { Dlg } from "../../components/Dlg";
import { FldSelect } from "../../components/FldSelect";
import { Av } from "../../components/Av";

interface TeamTabProps {
  project: Project;
  teamMembers: UserType[];
  candidates: UserType[];
  onUpdateTeam: (userIds: number[], leadId?: number) => Promise<void>;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TeamTab({ project, teamMembers, candidates, onUpdateTeam }: TeamTabProps) {
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [projectTeamSearch, setProjectTeamSearch] = useState("");

  async function handleManageTeam() {
    try {
      await onUpdateTeam(
        selectedTeamIds,
        selectedLeadId ? Number(selectedLeadId) : undefined
      );
      setShowManageTeam(false);
      setSelectedTeamIds([]);
      setSelectedLeadId("");
    } catch (err: any) {
      console.error("Failed to update team:", err);
    }
  }

  function toggleTeamMember(userId: number) {
    setSelectedTeamIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function openManageTeam() {
    setSelectedTeamIds(project.teamUserIds);
    setSelectedLeadId(project.leadId?.toString() || "");
    setShowManageTeam(true);
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-foreground">Team</h2>
          </div>
          <button
            onClick={openManageTeam}
            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            Manage
          </button>
        </div>
        
        {/* Team Lead */}
        <div className="mb-6">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Lead</span>
          <div className="flex items-center gap-2 mt-2">
            {project.lead ? (
              <>
                <Av name={project.lead.name} size="sm" />
                <span className="text-sm text-foreground">{project.lead.name}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Unassigned</span>
            )}
          </div>
        </div>

        {/* Team Members */}
        <div className="mb-6">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Team Members</span>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">No team members</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mt-2">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Av name={member.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground truncate block">{member.name}</span>
                    {member.id === project.leadId && (
                      <span className="text-xs text-muted-foreground">(Lead)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Approval Status */}
        {project.teamApprovedAt && (
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-emerald-600">
              <UserCheck size={16} />
              <span className="text-sm font-medium">Team approved</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {fmtDate(project.teamApprovedAt)}
            </p>
          </div>
        )}
      </div>

      {showManageTeam && (
        <Dlg title="Manage Project Team" onClose={() => setShowManageTeam(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Team Members
              </span>
              <input
                type="text"
                placeholder="Search team members..."
                value={projectTeamSearch}
                onChange={(e) => setProjectTeamSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-blue-400 mb-2"
              />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No eligible users in this project's departments. Add users to one of the project's departments first.
                  </p>
                ) : (
                  candidates
                    .filter((user) => user.name.toLowerCase().includes(projectTeamSearch.toLowerCase()))
                    .map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.includes(user.id)}
                        onChange={() => toggleTeamMember(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Av name={user.name} size="sm" />
                      <span className="text-sm text-foreground">{user.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <FldSelect
              label="Select Lead"
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              options={[
                { value: "", label: "Select lead" },
                ...candidates
                  .filter((u) => u.role?.permissions?.includes("task:manage") || u.role?.permissions?.includes("task:create"))
                  .map((u) => ({ value: u.id.toString(), label: u.name })),
              ]}
            />
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setShowManageTeam(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleManageTeam}
              disabled={selectedTeamIds.length === 0 && !selectedLeadId}
              className="px-4 py-2 bg-[#0C1022] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2240] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Team
            </button>
          </div>
        </Dlg>
      )}
    </>
  );
}