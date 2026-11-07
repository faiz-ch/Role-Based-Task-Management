import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Pop-up notifications (top-right). Errors stay until closed, so they are never
 * missed; success messages close by themselves. The page underneath never changes.
 *
 * The same message shown twice at once appears only once (it is used as the id).
 */
const openErrors = new Set<string>();

export function notifyError(message: string) {
  if (!message) return;
  const id = `err:${message}`;
  openErrors.add(id);
  toast.error(message, { id, duration: Infinity, onDismiss: () => openErrors.delete(id) });
}

/** Close all error pop-ups (used when the person tries again or an action succeeds). */
export function clearErrors() {
  openErrors.forEach((id) => toast.dismiss(id));
  openErrors.clear();
}

export function notifySuccess(message: string) {
  if (!message) return;
  clearErrors();
  toast.success(message, { id: `ok:${message}`, duration: 3500 });
}

/**
 * Drop-in replacement for `const [error, setError] = useState<string|null>(null)`
 * used for ACTION errors: calling it with a message shows a pop-up instead of a
 * red banner; calling it with null (as pages do when the person tries again)
 * closes the old error pop-ups.
 */
export function useErrorPopup() {
  return useCallback((message: string | null | undefined) => {
    if (message) notifyError(message);
    else clearErrors();
  }, []);
}
