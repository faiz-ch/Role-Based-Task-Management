import React, { useState } from "react";
import { Inbox, History } from "lucide-react";
import { useCachedQuery, FRESH, EMPTY } from "../api/queries";
import { ProjectApproval, getApprovalInbox } from "../api/approvals";
import { ApprovalCard } from "../components/ApprovalCard";

/** Approvals inbox: requests waiting for my decision, and the ones I decided. */
export function ApprovalsInboxPage() {
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const q = useCachedQuery<ProjectApproval[]>(["approvals", "inbox", tab], () => getApprovalInbox(tab), EMPTY, { staleTime: FRESH.LIVE });
  const rows = q.data;
  return (
    <div className="rlk-dash" style={{ maxWidth: 1100 }}>
      <div className="rlk-dash__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="rlk-eyebrow">Rashid Latif Khan Group</span>
          <h1 className="rlk-dash__title">Approvals</h1>
          <p className="rlk-dash__sub">Requests that need your decision</p>
        </div>
      </div>
      <div className="rlk-orgtabs" role="tablist" aria-label="Approvals">
        <button role="tab" type="button" aria-selected={tab === "pending"} className="rlk-orgtab" onClick={() => setTab("pending")}><Inbox size={16} /> Waiting for me</button>
        <button role="tab" type="button" aria-selected={tab === "decided"} className="rlk-orgtab" onClick={() => setTab("decided")}><History size={16} /> Decided by me</button>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rlk-panel p-10 text-center text-sm text-muted-foreground" data-testid="inbox-empty">
          {tab === "pending" ? "Nothing is waiting for you." : "You have not decided any requests yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4" data-testid="inbox-list">
          {rows.map((a) => <ApprovalCard key={a.id} a={a} showProject />)}
        </div>
      )}
    </div>
  );
}
