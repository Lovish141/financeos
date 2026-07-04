"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TopSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative w-full max-w-[340px]"
    >
      <Search
        className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${
          focused ? "text-brand-600" : "text-ink-400"
        }`}
        strokeWidth={2}
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search everything"
        className="w-full rounded-xl border border-ink-300 bg-white py-2 pl-9 pr-14 text-[13.5px] text-ink-900 outline-none transition-all duration-150 placeholder:text-ink-400 focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[5px] border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-400 sm:block">
        ⌘K
      </kbd>
    </form>
  );
}
