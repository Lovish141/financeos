"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// A tiny module-level pub/sub so any client component can fire a toast without
// prop-drilling a context. Mirrors the design's `toast(msg)` helper.
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

/** Show a transient toast (matches the design's bottom-center confirmation). */
export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

function ToastViewport() {
  const [data, setData] = useState<{ msg: string; key: number } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Imperative toasts (inline actions that don't navigate).
  useEffect(() => {
    const l: Listener = (msg) => setData({ msg, key: Date.now() });
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Flash toasts carried across a server redirect via ?flash=… — show once,
  // then strip the param so a refresh doesn't replay it.
  useEffect(() => {
    const flash = searchParams.get("flash");
    if (!flash) return;
    setData({ msg: flash, key: Date.now() });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  // Auto-dismiss (design: 2400ms).
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => setData(null), 2400);
    return () => clearTimeout(t);
  }, [data]);

  if (!data) return null;

  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-none fixed bottom-[26px] left-1/2 z-[60] flex items-center gap-[11px] rounded-xl px-[18px] py-3 text-white"
      style={{ background: "oklch(0.26 0.02 260)", boxShadow: "0 12px 34px oklch(0.2 0.02 260 / 0.34)" }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "oklch(0.6 0.11 162)" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="text-[13.5px] font-semibold">{data.msg}</span>
    </div>
  );
}

export function Toaster() {
  // useSearchParams requires a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <ToastViewport />
    </Suspense>
  );
}
