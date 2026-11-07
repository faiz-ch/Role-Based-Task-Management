import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Pop-up notifications (top-right). Errors stay until closed, so they are never
 * missed; success messages close by themselves. The page underneath never changes.
 *
 * The same message shown twice at once appears only once (it is used as the id).
 */
export function notifyError(message: string) {
  if (!message) return;
  toast.error(message, { id: `err:${message}`, duration: Infinity });
}

export function notifySuccess(message: string) {
  if (!message) return;
  toast.success(message, { id: `ok:${message}`, duration: 3500 });
}

/**
 * Drop-in replacement for `const [error, setError] = useState<string|null>(null)`
 * used for ACTION errors: calling it with a message shows a pop-up instead of a
 * red banner; calling it with null does nothing.
 */
export function useErrorPopup() {
  return useCallback((message: string | null | undefined) => {
    if (message) notifyError(message);
  }, []);
}
