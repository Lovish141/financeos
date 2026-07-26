"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { COMMON_UNITS } from "@/lib/csv";

const MAX_H = 224; // px — matches the list's max-h-56, used for flip math.

/**
 * Unit picker: a free-text field with a suggestion dropdown that actually opens
 * on click. Replaces the native <datalist>, whose popup doesn't reliably open in
 * Chrome. The list is portalled to <body> and anchored to the input, so it never
 * grows an ancestor's scroll area (drawers/dialogs scroll their own body). Any
 * custom unit is still allowed; the list is only a shortcut.
 */
export function UnitInput({
  value,
  onChange,
  placeholder = "kg, piece, hour…",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; drop: "down" | "up" } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = value.trim().toLowerCase();
  // Filter as the user types, but show the full list on an empty field.
  const matches = useMemo(
    () => (q ? COMMON_UNITS.filter((u) => u.toLowerCase().includes(q)) : COMMON_UNITS),
    [q],
  );

  // Anchor the portalled list to the input, flipping above when space below is
  // tight. Recomputed on open and on any scroll/resize so it stays glued.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const drop: "down" | "up" = below < MAX_H && r.top > below ? "up" : "down";
      setPos({ left: r.left, top: drop === "down" ? r.bottom + 4 : r.top - 4, width: r.width, drop });
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, matches.length]);

  // Close when a click lands outside the input and the portalled list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        className="input pr-9"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Toggle unit suggestions"
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-400 hover:text-ink-600"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      {open &&
        matches.length > 0 &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            className="fixed z-[80] max-h-56 overflow-auto rounded-xl border border-ink-200 bg-white py-1 shadow-lg"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              transform: pos.drop === "up" ? "translateY(-100%)" : undefined,
            }}
          >
            {matches.map((u) => (
              <li key={u}>
                <button
                  type="button"
                  // mousedown (not click) so selection wins the race against the
                  // input's blur, which would otherwise close the list first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(u);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-ink-50 ${
                    u.toLowerCase() === q ? "font-semibold text-brand-700" : "text-ink-700"
                  }`}
                >
                  {u}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
