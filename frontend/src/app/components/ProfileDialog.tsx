import React, { useEffect, useRef, useState } from "react";
import { X, Camera, Trash2, KeyRound, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../api/client";
import { uploadAvatar, deleteAvatar, changeMyPassword } from "../api/users";
import { notifyError, notifySuccess } from "../utils/notify";
import { describeScope } from "../utils/orgScope";

const MAX_PHOTO = 2 * 1024 * 1024;

function fmt(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * My Profile: a large pop-up (full screen on a phone).
 * People can see their own details, change their photo and their password — nothing else.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { currentUser, setCurrentUser } = useAuth();
  const [photoKey, setPhotoKey] = useState(() => Date.now());
  const [busyPhoto, setBusyPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busyPw, setBusyPw] = useState(false);

  // Esc closes; the page behind does not scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (!currentUser) return null;
  const u = currentUser;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { notifyError("Please choose a JPG, PNG, WebP or GIF image."); return; }
    if (file.size > MAX_PHOTO) { notifyError("The photo must be under 2 MB."); return; }
    setBusyPhoto(true);
    try {
      setCurrentUser(await uploadAvatar(u.id, file));
      setPhotoKey(Date.now());
      notifySuccess("Profile photo updated");
    } catch (err: any) {
      notifyError(err?.message || "Could not upload the photo.");
    } finally {
      setBusyPhoto(false);
    }
  }

  async function onRemovePhoto() {
    setBusyPhoto(true);
    try {
      setCurrentUser(await deleteAvatar(u.id));
      notifySuccess("Profile photo removed");
    } catch (err: any) {
      notifyError(err?.message || "Could not remove the photo.");
    } finally {
      setBusyPhoto(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!current) { notifyError("Enter your current password."); return; }
    if (next.length < 8) { notifyError("The new password must be at least 8 characters."); return; }
    if (next !== confirm) { notifyError("The new passwords do not match."); return; }
    if (next === current) { notifyError("The new password must be different from the current one."); return; }
    setBusyPw(true);
    try {
      await changeMyPassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      notifySuccess("Password changed. Use the new password next time you sign in.");
    } catch (err: any) {
      notifyError(err?.message || "Could not change the password.");
    } finally {
      setBusyPw(false);
    }
  }

  const info: [string, React.ReactNode][] = [
    ["Full Name", u.name],
    ["Email", u.email],
    ["Employee Code", u.employeeCode ? <span className="font-mono">{u.employeeCode}</span> : "—"],
    ["Designation", u.designation || "—"],
    ["Role", u.role?.name || "No role"],
    ["Joining Date", fmt(u.joiningDate)],
    ["Area", u.area?.name || "—"],
    ["Station", u.station ? `${u.station.name}${u.station.code ? ` (${u.station.code})` : ""}` : "—"],
    ["Department", u.department?.name || "—"],
    ["Division", u.division?.name || "—"],
    ["Manages", describeScope(u)],
  ];
  const inputCls = "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A24B]/30 focus:border-[#C9A24B] text-foreground";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="bg-white w-full sm:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden h-full sm:h-auto sm:min-h-[min(680px,85vh)] sm:max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-[#15171C] text-white flex-shrink-0">
          <h2 id="profile-title" className="text-base font-bold">My Profile</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-white/10 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
            {/* Photo */}
            <div className="p-6 md:border-r border-border flex flex-col items-center gap-4 bg-[#FAF8F3]">
              <div className="w-40 h-40 rounded-full overflow-hidden ring-4 ring-[#C9A24B]/40 bg-[#15171C] flex items-center justify-center">
                {u.hasAvatar ? (
                  <img src={`${API_BASE_URL}/users/${u.id}/avatar?v=${photoKey}`} alt="Your profile photo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl font-bold text-[#C9A24B]" aria-hidden="true">{initials(u.name)}</span>
                )}
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.role?.name || "No role"}</p>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPhoto} aria-label="Choose a profile photo" />
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                <button type="button" disabled={busyPhoto} onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#15171C] text-white hover:bg-[#2A2D35] disabled:opacity-60 cursor-pointer">
                  <Camera size={15} /> {u.hasAvatar ? "Change photo" : "Upload photo"}
                </button>
                {u.hasAvatar && (
                  <button type="button" disabled={busyPhoto} onClick={onRemovePhoto}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-60 cursor-pointer">
                    <Trash2 size={15} /> Remove photo
                  </button>
                )}
                <p className="text-xs text-muted-foreground text-center">JPG, PNG, WebP or GIF, up to 2 MB.</p>
              </div>
            </div>

            {/* Details + password */}
            <div className="p-6 space-y-6">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">My information</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {info.map(([k, v]) => (
                    <div key={k} className={k === "Manages" ? "sm:col-span-2" : ""}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="text-sm font-medium text-foreground break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground mt-3">To correct any of these details, contact your administrator.</p>
              </section>

              <section className="border-t border-border pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <KeyRound size={14} /> Change password
                </h3>
                <form onSubmit={onChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Current password</span>
                    <input id="pf-current" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">New password</span>
                    <input id="pf-new" type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Confirm new password</span>
                    <input id="pf-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
                  </label>
                  <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
                    <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                      {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? "Hide passwords" : "Show passwords"}
                    </button>
                    <span className="text-xs text-muted-foreground">At least 8 characters. You stay signed in.</span>
                    <button type="submit" disabled={busyPw}
                      className="px-5 py-2.5 text-sm font-bold rounded-lg bg-[#C9A24B] text-[#15171C] hover:brightness-95 disabled:opacity-60 cursor-pointer">
                      {busyPw ? "Saving…" : "Change password"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
