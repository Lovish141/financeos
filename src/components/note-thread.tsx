"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { formatRelativeShort } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { RequestNote, NoteAuthor } from "@/lib/request-notes";

// Shared buyer↔staff conversation thread. `viewpoint` is the side the current
// user is on — their own notes align right and read "You"; the other side reads
// as the supplier or the buyer. A long thread is capped (`maxHeight`) and scrolls
// internally, pinned to the newest message.
export function NoteThread({
  notes,
  viewpoint,
  otherLabel,
  maxHeight = 300,
}: {
  notes: RequestNote[];
  viewpoint: NoteAuthor;
  otherLabel: string; // what to call the other side ("Supplier" / buyer name)
  maxHeight?: number; // px cap before the thread scrolls internally
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes.length]);

  if (notes.length === 0) {
    return <p className="py-2 text-[12.5px] text-ink-400">No messages yet.</p>;
  }
  return (
    <div ref={scrollRef} className="space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight }}>
      {notes.map((n) => {
        const mine = n.from === viewpoint;
        const who = mine ? "You" : n.authorName || otherLabel;
        return (
          <div key={n.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed",
                mine
                  ? "bg-brand-600 text-white"
                  : n.from === "STAFF"
                    ? "bg-watch-50 text-watch-600 ring-1 ring-inset ring-watch-500/15"
                    : "bg-ink-100 text-ink-700",
              )}
            >
              <div className="whitespace-pre-wrap break-words">{n.text}</div>
            </div>
            <div className="mt-1 px-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-400">
              {who} · {formatRelativeShort(n.at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compose box for adding a reply to a thread. Calls `onSend`, clears on success. */
export function NoteComposer({
  onSend,
  placeholder = "Write a message…",
  className,
}: {
  onSend: (text: string) => Promise<{ error?: string } | void>;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const res = await onSend(t);
    setBusy(false);
    if (!res?.error) setText("");
  }

  return (
    <div className={cn("flex items-end gap-2", className)}>
      <textarea
        className="input min-h-[40px] flex-1 resize-y py-2"
        rows={1}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button
        type="button"
        onClick={send}
        disabled={busy || !text.trim()}
        className="btn-primary shrink-0"
        title="Send (⌘/Ctrl+Enter)"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}
