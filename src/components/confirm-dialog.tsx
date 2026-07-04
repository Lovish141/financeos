"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Trash2, Archive, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "./toaster";

type Tone = "danger" | "neutral";

const ICONS = {
  delete: Trash2,
  archive: Archive,
  restore: RotateCcw,
} as const;

/**
 * Design-parity confirm modal for destructive/irreversible actions. Replaces
 * the browser `window.confirm` with the design's centred card (icon, heading,
 * impact note, Cancel / action buttons). Calls a bound server action; if the
 * action redirects, the flash param shows the toast — otherwise `toastMessage`
 * is fired here after it resolves.
 */
export function ConfirmDialog({
  action,
  heading,
  body,
  detail,
  wide = false,
  confirmLabel = "Delete",
  tone = "danger",
  icon = "delete",
  toastMessage,
  onConfirmed,
  triggerClassName,
  triggerTitle,
  children,
}: {
  action: () => void | Promise<void>;
  heading: string;
  body: ReactNode;
  /**
   * Optional extra content loaded lazily when the dialog opens (e.g. the list of
   * templates/products a cost is used in). Fetched fresh on each open so the
   * impact reflects current data. Rendered below `body`.
   */
  detail?: () => Promise<ReactNode>;
  /** Roomier card — use when `detail` renders a list that needs the width. */
  wide?: boolean;
  confirmLabel?: string;
  tone?: Tone;
  icon?: keyof typeof ICONS;
  /** Fire this toast when the action does NOT redirect (e.g. archive/restore). */
  toastMessage?: string;
  /** Called after a non-redirecting action resolves (e.g. to refresh/close a drawer). */
  onConfirmed?: () => void;
  triggerClassName?: string;
  triggerTitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();
  const [detailNode, setDetailNode] = useState<ReactNode>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const Icon = ICONS[icon];

  useEffect(() => setMounted(true), []);

  // Lazy-load `detail` each time the dialog opens; clear it on close so the next
  // open refetches rather than showing stale impact.
  useEffect(() => {
    if (!open || !detail) return;
    let cancelled = false;
    setDetailLoading(true);
    detail()
      .then((node) => {
        if (!cancelled) setDetailNode(node);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
      setDetailNode(null);
      setDetailLoading(false);
    };
  }, [open, detail]);

  // Close on Escape while open (unless an action is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const danger = tone === "danger";
  const iconTint = danger ? "oklch(0.96 0.03 30)" : "oklch(0.96 0.01 260)";
  const iconColor = danger ? "oklch(0.55 0.15 30)" : "oklch(0.45 0.02 260)";
  const confirmBg = danger ? "oklch(0.55 0.16 28)" : "oklch(0.28 0.02 260)";

  function confirm() {
    start(async () => {
      await action();
      // Redirecting actions never reach here (navigation unmounts us); the
      // flash param handles their toast. Non-redirecting actions land here.
      if (toastMessage) toast(toastMessage);
      setOpen(false);
      onConfirmed?.();
    });
  }

  return (
    <>
      <button type="button" title={triggerTitle} className={triggerClassName} onClick={() => setOpen(true)}>
        {children}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center p-6"
            style={{ background: "oklch(0.2 0.02 260 / 0.35)", backdropFilter: "blur(3px)" }}
            onClick={() => !pending && setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`animate-pop flex max-h-[85vh] w-full ${wide ? "max-w-[460px]" : "max-w-[400px]"} flex-col rounded-[18px] bg-white p-[26px]`}
              style={{ boxShadow: "0 24px 70px oklch(0.2 0.02 260 / 0.28)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-[13px]"
                  style={{ background: iconTint, color: iconColor }}
                >
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mb-2 text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">{heading}</h3>
                <div className="text-[13.5px] leading-[1.55] text-ink-500">{body}</div>
                {detail && (
                  <div className="mt-4">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-[12.5px] text-ink-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading impact…
                      </div>
                    ) : (
                      detailNode
                    )}
                  </div>
                )}
              </div>
              <div className="mt-[22px] flex shrink-0 gap-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="flex flex-1 items-center justify-center rounded-[10px] border border-ink-200 bg-white py-[11px] text-[13.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-[11px] text-[13.5px] font-bold text-white transition-[filter] hover:brightness-95 disabled:opacity-60"
                  style={{ background: confirmBg }}
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending ? "Working…" : confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
