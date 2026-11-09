import React from "react";
import { useCachedQuery, qk, FRESH, EMPTY } from "../../api/queries";
import { ProjectApproval, getProjectApprovals } from "../../api/approvals";
import { ApprovalCard } from "../../components/ApprovalCard";

/** The approvals this project needs, with status, history and Request / decision buttons. */
export function ApprovalsTab({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const q = useCachedQuery<ProjectApproval[]>([...qk.project(projectId), "approvals"], () => getProjectApprovals(projectId), EMPTY, { staleTime: FRESH.LIVE });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading approvals…</p>;
  if (q.data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-10 text-center text-sm text-muted-foreground" data-testid="approvals-empty">
        This project does not need any approvals.{canEdit && " Choose them in Settings → Edit project → Required approvals."}
      </div>
    );
  }
  const done = q.data.filter((a) => a.status === "Approved").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{done} of {q.data.length} approved</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {q.data.map((a) => <ApprovalCard key={a.id} a={a} />)}
      </div>
    </div>
  );
}
