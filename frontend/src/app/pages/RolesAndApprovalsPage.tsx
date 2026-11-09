import React from "react";
import { useSearchParams } from "react-router";
import { Shield, Stamp } from "lucide-react";
import { RolesPage } from "./RolesPage";
import { ApprovalTypesTab } from "./ApprovalTypesTab";

/** Roles & Approvals: two tabs, Roles and Approvals (approval types and who approves them). */
export function RolesAndApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "approvals" ? "approvals" : "roles";
  return (
    <div className="rlk-dash" style={{ maxWidth: 1400 }}>
      <div className="rlk-dash__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="rlk-eyebrow">Rashid Latif Khan Group</span>
          <h1 className="rlk-dash__title">Roles &amp; Approvals</h1>
          <p className="rlk-dash__sub">{tab === "roles" ? "Roles and their permissions" : "Approval types and who approves them"}</p>
        </div>
      </div>
      <div className="rlk-orgtabs" role="tablist" aria-label="Roles and approvals">
        <button role="tab" type="button" aria-selected={tab === "roles"} className="rlk-orgtab" onClick={() => setParams({}, { replace: true })}>
          <Shield size={16} aria-hidden="true" /> Roles
        </button>
        <button role="tab" type="button" aria-selected={tab === "approvals"} className="rlk-orgtab" onClick={() => setParams({ tab: "approvals" }, { replace: true })}>
          <Stamp size={16} aria-hidden="true" /> Approvals
        </button>
      </div>
      <div role="tabpanel">{tab === "roles" ? <RolesPage embedded /> : <ApprovalTypesTab />}</div>
    </div>
  );
}
