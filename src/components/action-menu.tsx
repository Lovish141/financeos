"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Loader2, MoreHorizontal } from "lucide-react";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

/** Props a lucide icon accepts — every action item renders one. */
type IconComponent = ComponentType<{ className?: string; strokeWidth?: number }>;

export interface ActionItem {
  /** Stable identity — also keys the item's confirm dialog. */
  key: string;
  label: string;
  icon: IconComponent;
  /** Danger items render in the risk palette and sit below an automatic divider. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /**
   * Run on select. May be async — the trigger shows a spinner until it settles,
   * which is the only feedback left once the menu has closed.
   */
  onSelect?: () => void | Promise<void>;
  /**
   * Guard the action behind the confirm modal instead of running it directly.
   * The menu owns the dialog (rendered controlled, outside the popup) so it
   * survives the menu closing. Mutually exclusive with `onSelect`.
   */
  confirm?: Omit<ConfirmDialogProps, "open" | "onOpenChange" | "children" | "triggerClassName" | "triggerTitle">;
}

const MENU_WIDTH = 188;
const VIEWPORT_MARGIN = 8;

/**
 * The single "⋯" menu that fronts every row / card / drawer action cluster.
 * Replaces the old side-by-side icon buttons so a view exposes one affordance
 * regardless of how many actions it has.
 *
 * The popup is portaled to `document.body` and positioned from the trigger's
 * viewport rect, so it escapes the `overflow-hidden` table and card containers
 * it's usually rendered inside.
 */
export function ActionMenu({
  items,
  label = "Actions",
  triggerLabel,
  triggerClassName = "icon-btn",
  align = "end",
}: {
  items: ActionItem[];
  /** Accessible name + tooltip for the trigger. */
  label?: string;
  /**
   * Visible text on the trigger. Table rows leave this off (the "⋯" reads fine
   * in a dense action column); drawer headers set it, where a lone glyph would
   * be the only affordance on an otherwise empty toolbar.
   */
  triggerLabel?: string;
  triggerClassName?: string;
  /** Which trigger edge the popup lines up with. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which item's confirm dialog is open, if any. */
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /** Keyboard cursor; -1 when the pointer is driving instead. */
  const [active, setActive] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Danger actions are pushed to the bottom behind a divider, so a destructive
  // item is never adjacent to a routine one. Keyboard order follows what's on
  // screen, so the cursor indexes this list — not the caller's original order.
  const ordered = [...items].sort((a, b) => Number(a.tone === "danger") - Number(b.tone === "danger"));
  const firstDanger = ordered.findIndex((i) => i.tone === "danger");
  const enabled = ordered.filter((i) => !i.disabled);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Rough height estimate is enough to decide flip direction; the popup is
    // short and the estimate only picks above-vs-below.
    const height = items.length * 34 + 12;
    const below = window.innerHeight - r.bottom;
    const top = below < height + VIEWPORT_MARGIN && r.top > below ? r.top - height - 6 : r.bottom + 6;
    const rawLeft = align === "end" ? r.right - MENU_WIDTH : r.left;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    setPos({ top, left });
  }, [align, items.length]);

  // Position before paint so the popup never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Dismiss on anything that would leave the popup stranded: an outside click,
  // Escape, or the trigger scrolling away underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Capture phase so scrolling in any ancestor (drawer body, table) counts.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Move focus into the popup so arrow keys and Enter work straight away.
  // `preventScroll` matters: the popup is fixed-positioned, so letting the
  // browser scroll it "into view" would shift the page out from under the
  // pointer — and trip the scroll-to-dismiss handler above.
  useEffect(() => {
    if (open) {
      setActive(-1);
      popupRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  async function select(item: ActionItem) {
    if (item.disabled) return;
    setOpen(false);
    if (item.confirm) {
      setConfirmKey(item.key);
      return;
    }
    const result = item.onSelect?.();
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
      } finally {
        setBusy(false);
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (enabled.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + enabled.length) % enabled.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active >= 0) void select(enabled[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || items.length === 0}
        className={triggerClassName}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {busy ? (
          <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={1.9} />
        ) : (
          <MoreHorizontal className="h-[15px] w-[15px]" strokeWidth={2} />
        )}
        {triggerLabel}
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="animate-pop fixed z-[80] overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1.5 outline-none"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH, boxShadow: "0 12px 34px oklch(0.2 0.02 260 / 0.18)" }}
          >
            {ordered.map((item, idx) => {
              const danger = item.tone === "danger";
              const Icon = item.icon;
              const cursor = enabled.indexOf(item);
              return (
                <div key={item.key}>
                  {idx === firstDanger && idx > 0 && <div className="my-1.5 h-px bg-[var(--border)]" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onMouseEnter={() => setActive(cursor)}
                    onClick={(e) => {
                      e.stopPropagation();
                      void select(item);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      danger ? "text-risk-500 hover:bg-risk-50" : "text-ink-700 hover:bg-ink-50"
                    } ${cursor >= 0 && cursor === active ? (danger ? "bg-risk-50" : "bg-ink-50") : ""}`}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.9} />
                    <span className="truncate">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}

      {/* Confirm dialogs live outside the popup so they outlive it. */}
      {items
        .filter((i) => i.confirm)
        .map((i) => (
          <ConfirmDialog
            key={i.key}
            {...i.confirm!}
            open={confirmKey === i.key}
            onOpenChange={(o) => setConfirmKey(o ? i.key : null)}
          />
        ))}
    </>
  );
}
