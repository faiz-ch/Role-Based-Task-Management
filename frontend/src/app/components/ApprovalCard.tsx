import React, { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, XCircle, Undo2, Clock, Send, Paperclip, ChevronDown, ChevronRight, CircleDashed, ShieldAlert } from "lucide-react";
import { ProjectApproval, ApprovalStatus, requestApproval, decideApproval, fetchApprovalAttachmentUrl, fmtPKR } from "../api/approvals";
import { Dlg } from "./Dlg";
import { notifyError, notifySuccess } from "../utils/notify";

const STATUS_STYLE: Record<ApprovalStatus, { cls: string; Icon: React.ElementType }> = {
  "Not requested": { cls: "bg-slate-100 text-slate-600 border-slate-200", Icon: CircleDashed },
  Pending: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  Approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  Rejected: { cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
  "Sent back": { cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: Undo2 },
};
const ACTION_LABEL: Record<string, string> = { requested: "Requested", approved: "Approved", rejected: "Rejected", sent_back: "Sent back" };

const inputCls = "px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground w-full";
const labelCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const primaryBtn = "flex items-center justify-center gap-1.5 px-3 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer disabled:opacity-50";
const ghostBtn = "px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer";

export function fmtWhen(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE["Not requested"];
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`} data-testid="approval-status"><s.Icon size={12} />{status}</span>;
}

async function openAttachment(id: number) {
  try {
    const url = await fetchApprovalAttachmentUrl(id);
    window.open(url, "_blank", "noopener");
  } catch (e: any) { notifyError(e?.message || "Could not open the file."); }
}

// ---------------------------------------------------------------- request dialog
function RequestDialog({ a, onClose }: { a: ProjectApproval; onClose: () => void }) {
  const again = a.status !== "Not requested";
  const [amount, setAmount] = useState(a.amount != null ? String(a.amount) : "");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const amountNum = Number(amount.replace(/,/g, ""));

  async function send() {
    if (a.type.requiresAmount && (!amount.trim() || !(amountNum > 0))) return notifyError("Please enter an amount more than 0.");
    if (!reason.trim()) return notifyError("Please give a reason.");
    if (a.type.requiresAttachment && !file && !a.attachmentName) return notifyError("Please attach a file.");
    setSaving(true);
    try {
      await requestApproval(a.id, { reason: reason.trim(), amount: a.type.requiresAmount ? amount.replace(/,/g, "") : undefined, file });
      notifySuccess(`${a.type.name}: request sent`);
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not send the request."); }
    finally { setSaving(false); }
  }

  return (
    <Dlg title={`${again ? "Ask again" : "Request"}: ${a.type.name}`} onClose={onClose} size="md">
      <div className="space-y-4">
        {again && a.decisionComment && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
            <b>{a.status} by {a.decidedBy?.name}:</b> {a.decisionComment}
          </div>
        )}
        {a.type.requiresAmount && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ap-amount" className={labelCls}>Amount (PKR)</label>
            <input id="ap-amount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="e.g. 500000" />
            {amountNum > 0 && <span className="text-xs text-muted-foreground">{fmtPKR(amountNum)}</span>}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-reason" className={labelCls}>Reason</label>
          <textarea id="ap-reason" rows={4} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What it is for and why it is needed" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-file" className={labelCls}>Attachment {a.type.requiresAttachment ? "(required)" : "(optional)"}</label>
          <input id="ap-file" type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {!file && a.attachmentName && <span className="text-xs text-muted-foreground">Keeps the earlier file ({a.attachmentName}) unless you choose a new one.</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Goes to: {a.approverIsAdminFallback ? "the main Admin" : a.approvers.length ? a.approvers.map((p) => p.name).join(", ") : "the approvers"}.
        </p>
        <div className="flex justify-end gap-2">
          <button className={ghostBtn} onClick={onClose}>Cancel</button>
          <button className={primaryBtn} disabled={saving} onClick={send}><Send size={14} /> {saving ? "Sending…" : "Send request"}</button>
        </div>
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- decision dialog
function DecideDialog({ a, action, onClose }: { a: ProjectApproval; action: "approve" | "reject" | "send_back"; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState(a.amount != null ? String(a.amount) : "");
  const [saving, setSaving] = useState(false);
  const title = { approve: "Approve", reject: "Reject", send_back: "Send back" }[action];
  const amountNum = Number(amount.replace(/,/g, ""));

  async function go() {
    if (action !== "approve" && !comment.trim()) return notifyError("Please give a reason.");
    if (action === "approve" && a.type.requiresAmount) {
      if (!(amountNum > 0)) return notifyError("Please enter the approved amount.");
      if (a.amount != null && amountNum > a.amount) return notifyError("The approved amount cannot be more than the amount requested.");
    }
    setSaving(true);
    try {
      await decideApproval(a.id, { action, comment: comment.trim(), approvedAmount: action === "approve" && a.type.requiresAmount ? amountNum : null });
      notifySuccess(`${a.type.name}: ${title.toLowerCase()}${action === "approve" ? "d" : action === "reject" ? "ed" : ""}`);
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not save the decision."); }
    finally { setSaving(false); }
  }

  return (
    <Dlg title={`${title}: ${a.type.name}`} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="text-sm text-foreground">
          <b>{a.projectName}</b>{a.amount != null && <> · requested {fmtPKR(a.amount)}</>}
        </div>
        {action === "approve" && a.type.requiresAmount && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ap-approved" className={labelCls}>Approved amount (PKR)</label>
            <input id="ap-approved" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
            <span className="text-xs text-muted-foreground">You may approve less than requested.</span>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ap-comment" className={labelCls}>{action === "approve" ? "Comment (optional)" : "Reason"}</label>
          <textarea id="ap-comment" rows={3} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={action === "send_back" ? "What should be changed" : action === "reject" ? "Why it is rejected" : ""} />
        </div>
        <div className="flex justify-end gap-2">
          <button className={ghostBtn} onClick={onClose}>Cancel</button>
          <button className={action === "approve" ? primaryBtn : "px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"}
            disabled={saving} onClick={go}>{saving ? "Saving…" : title}</button>
        </div>
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- card
export function ApprovalCard({ a, showProject = false }: { a: ProjectApproval; showProject?: boolean }) {
  const [dialog, setDialog] = useState<null | "request" | "approve" | "reject" | "send_back">(null);
  const [history, setHistory] = useState(false);
  const pending = a.status === "Pending";

  return (
    <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-3" data-testid={`approval-${a.type.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showProject && (
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
              {a.canOpenProject ? <Link to={`/projects/${a.projectId}`} className="hover:text-blue-600 hover:underline">{a.projectName}</Link> : a.projectName}
            </div>
          )}
          <h3 className="text-base font-bold text-foreground">{a.type.name}</h3>
          {a.type.description && <p className="text-xs text-muted-foreground">{a.type.description}</p>}
        </div>
        <ApprovalStatusPill status={a.status} />
      </div>

      {a.status !== "Not requested" && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {a.amount != null && <div><dt className="text-xs text-muted-foreground">Requested</dt><dd className="font-semibold">{fmtPKR(a.amount)}</dd></div>}
          {a.approvedAmount != null && <div><dt className="text-xs text-muted-foreground">Approved</dt><dd className="font-semibold text-emerald-700" data-testid="approved-amount">{fmtPKR(a.approvedAmount)}</dd></div>}
          <div><dt className="text-xs text-muted-foreground">Asked by</dt><dd>{a.requestedBy?.name ?? "—"} <span className="text-xs text-muted-foreground">· {fmtWhen(a.requestedAt)}</span></dd></div>
          {a.decidedBy && <div><dt className="text-xs text-muted-foreground">Decided by</dt><dd>{a.decidedBy.name} <span className="text-xs text-muted-foreground">· {fmtWhen(a.decidedAt)}</span></dd></div>}
          {a.reason && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Reason</dt><dd className="whitespace-pre-wrap">{a.reason}</dd></div>}
          {a.decisionComment && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Decision comment</dt><dd className="whitespace-pre-wrap">{a.decisionComment}</dd></div>}
          {a.attachmentName && (
            <div className="sm:col-span-2">
              <button type="button" onClick={() => openAttachment(a.id)} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline cursor-pointer">
                <Paperclip size={14} /> {a.attachmentName}
              </button>
            </div>
          )}
        </dl>
      )}

      {(a.status === "Not requested" || pending) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {a.approverIsAdminFallback && <ShieldAlert size={12} className="text-amber-600" />}
          {pending ? "Waiting for" : a.approvers.length === 1 && !a.approverIsAdminFallback ? "Approver" : "Approvers"}: {a.approverIsAdminFallback ? "the main Admin (no other approver)" : a.approvers.map((p) => p.name).join(", ") || "—"}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {a.canRequest && (
          <button className={primaryBtn} onClick={() => setDialog("request")}><Send size={14} /> {a.status === "Not requested" ? "Request" : "Ask again"}</button>
        )}
        {a.canDecide && (
          <>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer" onClick={() => setDialog("approve")}><CheckCircle2 size={14} /> Approve</button>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-orange-300 text-orange-700 text-sm font-semibold rounded-lg hover:bg-orange-50 cursor-pointer" onClick={() => setDialog("send_back")}><Undo2 size={14} /> Send back</button>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-50 cursor-pointer" onClick={() => setDialog("reject")}><XCircle size={14} /> Reject</button>
          </>
        )}
        {a.events.length > 0 && (
          <button type="button" onClick={() => setHistory(!history)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
            {history ? <ChevronDown size={14} /> : <ChevronRight size={14} />} History ({a.events.length})
          </button>
        )}
      </div>

      {history && (
        <ol className="border-l-2 border-border ml-1.5 pl-4 space-y-2" data-testid="approval-history">
          {a.events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-semibold">{ACTION_LABEL[e.action] ?? e.action}</span> by {e.actor?.name ?? "—"}
              <span className="text-xs text-muted-foreground"> · {fmtWhen(e.createdAt)}</span>
              {e.amount != null && <span className="text-xs"> · {fmtPKR(e.amount)}</span>}
              {e.comment && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{e.comment}</div>}
            </li>
          ))}
        </ol>
      )}

      {dialog === "request" && <RequestDialog a={a} onClose={() => setDialog(null)} />}
      {(dialog === "approve" || dialog === "reject" || dialog === "send_back") && <DecideDialog a={a} action={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
