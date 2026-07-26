import type { Prisma } from "@prisma/client";

// Threaded buyer↔staff communication on an OrderRequest. Notes live in the
// OrderRequest.notes JSON column as an array of RequestNote. This module is
// dependency-free (no node: imports) so it's safe to import from both server
// actions and client components.

export type NoteAuthor = "BUYER" | "STAFF";

export interface RequestNote {
  id: string;
  from: NoteAuthor; // which side of the conversation wrote it
  authorName: string | null; // display name at write time (may be null)
  text: string;
  at: string; // ISO timestamp
}

export const MAX_NOTE = 2000;

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `n${Date.now()}${Math.random().toString(36).slice(2)}`;
}

/** Coerce the OrderRequest.notes JSON column into a typed, validated thread. */
export function parseNotes(json: Prisma.JsonValue | null | undefined): RequestNote[] {
  if (!Array.isArray(json)) return [];
  const out: RequestNote[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.text !== "string" || typeof o.at !== "string") continue;
    out.push({
      id: typeof o.id === "string" ? o.id : newId(),
      from: o.from === "STAFF" ? "STAFF" : "BUYER",
      authorName: typeof o.authorName === "string" ? o.authorName : null,
      text: o.text,
      at: o.at,
    });
  }
  return out;
}

/** Build a new thread entry, trimming/capping the text. Returns null if empty. */
export function makeNote(from: NoteAuthor, authorName: string | null, text: string): RequestNote | null {
  const t = text.trim().slice(0, MAX_NOTE);
  if (!t) return null;
  return { id: newId(), from, authorName, text: t, at: new Date().toISOString() };
}
