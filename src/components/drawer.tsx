"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right slide-in panel (drawer). The single overlay primitive reused for record
 * preview and create/edit across Products and Cost Items — mirrors the design's
 * `slideIn` slide-over. Compose with `DrawerHeader` / `DrawerBody` /
 * `DrawerFooter` for consistent internal spacing.
 */
export function Drawer({
  open,
  onClose,
  width = 560,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Panel width in px (design: 452 preview, 660 forms). Clamped to 94vw. */
  width?: number;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div
        className="animate-fade-in fixed inset-0 z-[45]"
        style={{ background: "oklch(0.2 0.02 260 / 0.28)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-slide-in fixed right-0 top-0 z-[46] flex h-screen flex-col bg-white shadow-slideover"
        style={{ width: `min(${width}px, 94vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/**
 * Shared "lazy load" placeholder for drawers that fetch their content on open.
 * Use everywhere a drawer awaits data so the loading state is identical across
 * cost/product preview + edit drawers.
 */
export function DrawerSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-ink-50" />
      ))}
    </div>
  );
}

export function DrawerCloseButton({ onClose, size = 34 }: { onClose: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClose}
      title="Close"
      className="flex shrink-0 items-center justify-center rounded-[9px] border border-ink-200 bg-white text-ink-500 transition-colors hover:bg-ink-50"
      style={{ width: size, height: size }}
    >
      <X className="h-[17px] w-[17px]" strokeWidth={2.2} />
    </button>
  );
}

export function DrawerHeader({
  onClose,
  children,
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--border)] px-[26px] pb-[18px] pt-[22px]", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <DrawerCloseButton onClose={onClose} />
      </div>
    </div>
  );
}

export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-[26px] py-5", className)}>{children}</div>;
}

export function DrawerFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-end gap-2.5 border-t border-[var(--border)] px-[26px] py-4", className)}>
      {children}
    </div>
  );
}
