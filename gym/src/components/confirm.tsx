import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { Button } from "./ui";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** The verb on the confirming button: "Delete", "Clear", "Replace". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/* One native <dialog> for every destructive confirmation. showModal() traps
   focus and makes the rest of the page inert; closing returns focus to the
   control that opened it. On phones it is the kit's bottom sheet. */
export function ConfirmDialog({
  pending,
  onClose,
}: {
  pending: PendingConfirm | null;
  onClose: (value: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--sheet"
      aria-labelledby="confirm-title"
      aria-describedby={pending?.description ? "confirm-description" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      {pending ? (
        <>
          <div className="dialog-head">
            <h2 id="confirm-title">{pending.title}</h2>
          </div>
          {pending.description ? (
            <div className="dialog-body">
              <p
                id="confirm-description"
                className="text-sm leading-6 text-[var(--muted)]"
              >
                {pending.description}
              </p>
            </div>
          ) : null}
          <div className="dialog-foot">
            <Button variant="ghost" onClick={() => onClose(false)}>
              {pending.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={pending.tone === "danger" ? "danger" : "primary"}
              onClick={() => onClose(true)}
              autoFocus
            >
              {pending.confirmLabel}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

export function ConfirmProvider({ children }: PropsWithChildren) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  const close = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog pending={pending} onClose={close} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider.");
  return value;
}
