"use client";

import { useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { loadDemoData } from "@/server/actions/onboarding-actions";

export function LoadDemoButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending} onClick={() => start(async () => { await loadDemoData(); })}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {pending ? "Loading…" : "Load demo data"}
    </button>
  );
}
