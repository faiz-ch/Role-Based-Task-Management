import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, X, Users as UsersIcon, User as UserIcon, Lock, AlertTriangle } from "lucide-react";
import { useCachedQuery, FRESH, EMPTY } from "../api/queries";
import {
  ApprovalType, ApproverOptions, getApprovalTypes, getApproverOptions, createApprovalType, updateApprovalType, deleteApprovalType,
} from "../api/approvals";
import { Dlg } from "../components/Dlg";
import { notifyError, notifySuccess } from "../utils/notify";

/**
 * Roles & Approvals → Approvals tab.
 * Each approval type says who approves it: whole roles (every member, also people
 * given the role later) and/or named people (picked from a role, or searched).
 */

const th = "px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const td = "px-5 py-3.5 text-sm text-foreground align-top";
const inputCls = "px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-foreground w-full";
const labelCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";
const primaryBtn = "flex items-center gap-1.5 px-3 py-2 bg-[#15171C] text-white text-sm font-semibold rounded-lg hover:bg-[#2A2D35] transition-colors cursor-pointer disabled:opacity-50";
const ghostBtn = "px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer";

function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "gold" | "green" | "amber" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    gold: "bg-[#F4ECD8] text-[#6E5418] border-[#E2D3AC]",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  }[tone];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>{children}</span>;
}

// ---------------------------------------------------------------- approver picker
interface PickerValue { wholeRoleIds: number[]; userIds: number[] }

function ApproverPicker({ options, value, onChange }: { options: ApproverOptions | null; value: PickerValue; onChange: (v: PickerValue) => void }) {
  const [roleToAdd, setRoleToAdd] = useState<number | "">("");
  // roles opened as "only some people" (their picked members live in value.userIds)
  const [someRoles, setSomeRoles] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  if (!options) return <p className="text-sm text-muted-foreground">Loading people…</p>;

  const roleById = new Map(options.roles.map((r) => [r.id, r]));
  const userById = new Map(options.users.map((u) => [u.id, u]));
  const shownRoleIds = [...value.wholeRoleIds, ...someRoles.filter((id) => !value.wholeRoleIds.includes(id))];
  const memberIdsOfShownSome = new Set(someRoles.flatMap((id) => roleById.get(id)?.members.map((m) => m.id) ?? []));
  const individuals = value.userIds.filter((id) => !memberIdsOfShownSome.has(id));
  const addable = options.roles.filter((r) => !shownRoleIds.includes(r.id));

  function addRole() {
    if (roleToAdd === "") return;
    onChange({ ...value, wholeRoleIds: [...value.wholeRoleIds, Number(roleToAdd)] });
    setRoleToAdd("");
  }
  function setWhole(roleId: number, whole: boolean) {
    if (whole) {
      const members = new Set(roleById.get(roleId)?.members.map((m) => m.id) ?? []);
      setSomeRoles(someRoles.filter((x) => x !== roleId));
      onChange({ wholeRoleIds: [...value.wholeRoleIds, roleId], userIds: value.userIds.filter((u) => !members.has(u)) });
    } else {
      setSomeRoles([...someRoles, roleId]);
      onChange({ ...value, wholeRoleIds: value.wholeRoleIds.filter((x) => x !== roleId) });
    }
  }
  function removeRole(roleId: number) {
    const members = new Set(roleById.get(roleId)?.members.map((m) => m.id) ?? []);
    const wasSome = someRoles.includes(roleId);
    setSomeRoles(someRoles.filter((x) => x !== roleId));
    onChange({
      wholeRoleIds: value.wholeRoleIds.filter((x) => x !== roleId),
      userIds: wasSome ? value.userIds.filter((u) => !members.has(u)) : value.userIds,
    });
  }
  const toggleUser = (id: number) =>
    onChange({ ...value, userIds: value.userIds.includes(id) ? value.userIds.filter((x) => x !== id) : [...value.userIds, id] });

  const q = search.trim().toLowerCase();
  const found = q ? options.users.filter((u) => !value.userIds.includes(u.id) && `${u.name} ${u.email} ${u.role ?? ""}`.toLowerCase().includes(q)).slice(0, 8) : [];

  return (
    <div className="space-y-4" data-testid="approver-picker">
      {/* By role */}
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><UsersIcon size={15} /> By role</div>
        <div className="flex gap-2">
          <select aria-label="Role to add" className={inputCls} value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Choose a role…</option>
            {addable.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.members.length} {r.members.length === 1 ? "person" : "people"})</option>)}
          </select>
          <button type="button" className={ghostBtn} onClick={addRole} disabled={roleToAdd === ""}>Add</button>
        </div>
        {shownRoleIds.length === 0 && <p className="text-xs text-muted-foreground">No role added.</p>}
        {shownRoleIds.map((roleId) => {
          const role = roleById.get(roleId);
          if (!role) return null;
          const whole = value.wholeRoleIds.includes(roleId);
          return (
            <div key={roleId} className="border border-border rounded-lg p-3" data-testid={`role-card-${role.name}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{role.name}</span>
                <button type="button" aria-label={`Remove role ${role.name}`} onClick={() => removeRole(roleId)} className="p-1 rounded hover:bg-muted cursor-pointer"><X size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={`role-mode-${roleId}`} checked={whole} onChange={() => setWhole(roleId, true)} className="accent-blue-600" aria-label={`All members of ${role.name}`} />
                  All members ({role.members.length}){" "}<span className="text-xs text-muted-foreground">also people given this role later</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={`role-mode-${roleId}`} checked={!whole} onChange={() => setWhole(roleId, false)} className="accent-blue-600" aria-label={`Only selected people of ${role.name}`} />
                  Only selected people
                </label>
              </div>
              {!whole && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                  {role.members.length === 0 && <p className="text-xs text-muted-foreground">Nobody has this role yet.</p>}
                  {role.members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.userIds.includes(m.id)} onChange={() => toggleUser(m.id)} aria-label={`Approver ${m.name}`} />
                      <span>{m.name}<span className="block text-xs text-muted-foreground">{m.email}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* By person */}
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><UserIcon size={15} /> By person</div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input aria-label="Search people to add" placeholder="Search by name, email or role…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} />
          {found.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {found.map((u) => (
                <button key={u.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm cursor-pointer"
                  onClick={() => { toggleUser(u.id); setSearch(""); }}>
                  {u.name} <span className="text-xs text-muted-foreground">· {u.role || "No role"} · {u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {individuals.length === 0 && <p className="text-xs text-muted-foreground">No one added by name.</p>}
          {individuals.map((id) => {
            const u = userById.get(id);
            return (
              <span key={id} className="rlk-chip">
                {u ? u.name : `#${id}`}{u?.role && <span className="text-xs font-normal opacity-70">· {u.role}</span>}
                <button type="button" aria-label={`Remove ${u?.name ?? id}`} onClick={() => toggleUser(id)}><X size={12} /></button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- dialog
function TypeDialog({ editing, options, onClose }: { editing: ApprovalType | "new"; options: ApproverOptions | null; onClose: () => void }) {
  const isNew = editing === "new";
  const [form, setForm] = useState(() => isNew
    ? { name: "", description: "", requiresAmount: false, requiresAttachment: false, mandatory: false, isActive: true }
    : { name: editing.name, description: editing.description ?? "", requiresAmount: editing.requiresAmount, requiresAttachment: editing.requiresAttachment, mandatory: editing.mandatory, isActive: editing.isActive });
  const [people, setPeople] = useState<PickerValue>(() => isNew ? { wholeRoleIds: [], userIds: [] }
    : { wholeRoleIds: editing.roles.map((r) => r.id), userIds: editing.users.map((u) => u.id) });
  const [saving, setSaving] = useState(false);
  const builtin = !isNew && editing.isBuiltin;

  async function save() {
    if (!form.name.trim()) return notifyError("Please enter a name.");
    setSaving(true);
    try {
      const body = { ...form, name: form.name.trim(), description: form.description.trim(), roleIds: people.wholeRoleIds, userIds: people.userIds };
      if (isNew) await createApprovalType(body); else await updateApprovalType(editing.id, body);
      notifySuccess(isNew ? "Approval type created" : "Approval type saved");
      onClose();
    } catch (e: any) { notifyError(e?.message || "Could not save."); }
    finally { setSaving(false); }
  }
  const box = (key: "requiresAmount" | "requiresAttachment" | "mandatory" | "isActive", label: string, help: string, locked = false) => (
    <label className={`flex items-start gap-2.5 p-3 border border-border rounded-lg ${locked ? "opacity-60" : "cursor-pointer hover:bg-muted/30"}`}>
      <input type="checkbox" className="w-4 h-4 accent-blue-600 mt-0.5" checked={form[key]} disabled={locked}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })} aria-label={label} />
      <span className="text-sm"><span className="font-medium text-foreground">{label}</span>{locked && <Lock size={12} className="inline ml-1" />}<span className="block text-xs text-muted-foreground">{help}</span></span>
    </label>
  );

  return (
    <Dlg title={isNew ? "New approval type" : `Edit ${editing.name}`} onClose={onClose} size="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-name" className={labelCls}>Name</label>
            <input id="at-name" className={inputCls} value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Procurement" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-desc" className={labelCls}>Description (optional)</label>
            <input id="at-desc" className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this approval is for" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {box("requiresAmount", "Amount required", builtin ? "Budget always has an amount (PKR)." : "The request must state an amount in PKR.", builtin)}
          {box("requiresAttachment", "Attachment required", "A file (quotation, letter) must be attached.")}
          {box("mandatory", "Required for every project", "Added to every new project automatically; cannot be removed from it.")}
          {box("isActive", "Active", builtin ? "Budget always stays active." : "Inactive types cannot be added to projects; history is kept.", builtin)}
        </div>
        <div>
          <p className={`${labelCls} mb-2`}>Who approves</p>
          <ApproverPicker options={options} value={people} onChange={setPeople} />
          {people.wholeRoleIds.length === 0 && people.userIds.length === 0 && (
            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1"><AlertTriangle size={12} /> Nobody chosen: requests will go to the main Admin.</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">Nobody can approve a request they made. If the only approver made it, it goes to the main Admin.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostBtn} onClick={onClose}>Cancel</button>
          <button className={primaryBtn} disabled={saving} onClick={save}>{saving ? "Saving…" : isNew ? "Create" : "Save"}</button>
        </div>
      </div>
    </Dlg>
  );
}

// ---------------------------------------------------------------- tab
export function ApprovalTypesTab() {
  const typesQ = useCachedQuery<ApprovalType[]>(["approval-types"], getApprovalTypes, EMPTY, { staleTime: FRESH.NORMAL });
  const optsQ = useCachedQuery<ApproverOptions | null>(["approval-types", "approver-options"], getApproverOptions, null, { staleTime: FRESH.NORMAL });
  const [editing, setEditing] = useState<ApprovalType | "new" | null>(null);
  const [toDelete, setToDelete] = useState<ApprovalType | null>(null);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => typesQ.data.filter((t) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())), [typesQ.data, search]);

  async function remove() {
    if (!toDelete) return;
    try { await deleteApprovalType(toDelete.id); notifySuccess("Approval type deleted"); }
    catch (e: any) { notifyError(e?.message || "Could not delete."); }
    finally { setToDelete(null); }
  }

  return (
    <div className="rlk-panel" style={{ overflow: "hidden" }} data-testid="approval-types">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input aria-label="Search approval types" placeholder="Search approval types…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 max-w-full" />
        </div>
        <button onClick={() => setEditing("new")} className={primaryBtn}><Plus size={16} /> New Approval Type</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-muted/30 border-b border-border">
            <th className={th}>Approval</th><th className={th}>Who approves</th><th className={th}>Rules</th><th className={th}>Used in</th><th className={th}>Status</th><th className={`${th} text-right`}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {typesQ.isLoading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">No approval types match.</td></tr>
              : rows.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40">
                  <td className={td}>
                    <span className="font-semibold">{t.name}</span>{t.isBuiltin && <span className="ml-2"><Tag tone="gold"><Lock size={10} /> Built-in</Tag></span>}
                    {t.description && <span className="block text-xs text-muted-foreground max-w-[280px]">{t.description}</span>}
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1 max-w-[320px]">
                      {t.roles.map((r) => <Tag key={`r${r.id}`}><UsersIcon size={11} /> {r.name} (all)</Tag>)}
                      {t.users.map((u) => <Tag key={`u${u.id}`}><UserIcon size={11} /> {u.name}</Tag>)}
                      {t.roles.length === 0 && t.users.length === 0 && <span className="text-xs text-amber-700">Nobody yet: goes to the main Admin</span>}
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {t.requiresAmount && <Tag>Amount</Tag>}
                      {t.requiresAttachment && <Tag>Attachment</Tag>}
                      {t.mandatory && <Tag tone="amber">Every project</Tag>}
                      {!t.requiresAmount && !t.requiresAttachment && !t.mandatory && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className={td}>{t.inUse} project{t.inUse === 1 ? "" : "s"}</td>
                  <td className={td}>{t.isActive ? <Tag tone="green">Active</Tag> : <Tag>Inactive</Tag>}</td>
                  <td className={td}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} title="Edit" className="p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"><Pencil size={14} /></button>
                      {!t.isBuiltin && <button onClick={() => setToDelete(t)} aria-label={`Delete ${t.name}`} title="Delete" className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && <TypeDialog editing={editing} options={optsQ.data} onClose={() => setEditing(null)} />}
      {toDelete && (
        <Dlg title="Delete approval type" onClose={() => setToDelete(null)} size="sm">
          <p className="text-sm text-foreground">Delete <b>{toDelete.name}</b>? If a project uses it, make it inactive instead.</p>
          <div className="flex justify-end gap-2 pt-5">
            <button className={ghostBtn} onClick={() => setToDelete(null)}>Cancel</button>
            <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer" onClick={remove}>Delete</button>
          </div>
        </Dlg>
      )}
    </div>
  );
}
