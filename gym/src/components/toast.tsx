import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { clsx } from "clsx";

export type ToastTone = "neutral" | "good" | "alert";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastValue {
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  items: ToastItem[];
}

const ToastContext = createContext<ToastValue | null>(null);

const TOAST_LIFETIME_MS = 5000;

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
  }, []);

  const value = useMemo<ToastValue>(
    () => ({ toast, dismiss, items }),
    [dismiss, items, toast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue["toast"] {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value.toast;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  // The viewport passes a fresh callback on every render; keep the timer on the
  // toast itself so re-renders (route changes, other toasts) do not restart it.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    // Alerts (failed saves, restores, clipboard) stay until dismissed, so a phone
    // user who looks away does not lose the message about what to do next.
    if (paused || item.tone === "alert") return;
    const timer = window.setTimeout(() => dismissRef.current(), TOAST_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [item.tone, paused]);

  return (
    <div
      className={clsx(
        "toast",
        item.tone === "alert" && "toast--alert",
        item.tone === "good" && "toast--good",
      )}
      // A tap fires no matching leave, so only a mouse hover pauses the timer.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPaused(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setPaused(false);
      }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{item.message}</span>
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm"
        onClick={onDismiss}
        aria-label="Dismiss message"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/* The page's two live regions: one polite stack for ordinary messages and one
   assertive region for alerts. Rendered once, by AppShell. */
export function ToastViewport() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("ToastViewport must be used inside ToastProvider.");
  const polite = value.items.filter((item) => item.tone !== "alert");
  const alerts = value.items.filter((item) => item.tone === "alert");
  return (
    <>
      <div className="toast-stack" role="status" aria-live="polite">
        {polite.map((item) => (
          <Toast key={item.id} item={item} onDismiss={() => value.dismiss(item.id)} />
        ))}
      </div>
      <div className="toast-stack" role="alert" aria-live="assertive">
        {alerts.map((item) => (
          <Toast key={item.id} item={item} onDismiss={() => value.dismiss(item.id)} />
        ))}
      </div>
    </>
  );
}
