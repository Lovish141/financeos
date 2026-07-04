"use client";

import { useState, useTransition, type ReactNode } from "react";
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
  confirmLabel = "Delete",
  tone = "danger",
  icon = "delete",
  toastMessage,
  triggerClassName,
  triggerTitle,
  children,
}: {
  action: () => void | Promise<void>;
  heading: string;
  body: string;
  confirmLabel?: string;
  tone?: Tone;
  icon?: keyof typeof ICONS;
  /** Fire this toast when the action does NOT redirect (e.g. archive/restore). */
  toastMessage?: string;
  triggerClassName?: string;
  triggerTitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const Icon = ICONS[icon];

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
    });
  }

  return (
    <>
      <button type="button" title={triggerTitle} className={triggerClassName} onClick={() => setOpen(true)}>
        {children}
      </button>

      {open && (
        <div
          className="animate-fade-in fixed inset-0 z-[50] flex items-center justify-center p-6"
          style={{ background: "oklch(0.2 0.02 260 / 0.35)", backdropFilter: "blur(3px)" }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="animate-pop w-full max-w-[400px] rounded-[18px] bg-white p-[26px]"
            style={{ boxShadow: "0 24px 70px oklch(0.2 0.02 260 / 0.28)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-[13px]"
              style={{ background: iconTint, color: iconColor }}
            >
              <Icon className="h-6 w-6" strokeWidth={2} />
            </div>
            <h3 className="mb-2 text-[18px] font-extrabold tracking-[-0.02em] text-ink-900">{heading}</h3>
            <p className="text-[13.5px] leading-[1.55] text-ink-500">{body}</p>
            <div className="mt-[22px] flex gap-2.5">
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
        </div>
      )}
    </>
  );
}
