"use client";

import { Archive, RotateCcw } from "lucide-react";
import { archiveMasterCost, restoreMasterCost } from "@/server/actions/cost-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ArchiveButton({
  id,
  name,
  archived,
  usedInTemplates,
}: {
  id: string;
  name: string;
  archived: boolean;
  usedInTemplates: number;
}) {
  if (archived) {
    return (
      <ConfirmDialog
        action={restoreMasterCost.bind(null, id)}
        heading={`Restore ${name}?`}
        body="It will reappear in lists and pickers."
        confirmLabel="Restore"
        tone="neutral"
        icon="restore"
        toastMessage="Cost item restored"
        triggerClassName="btn-secondary"
      >
        <RotateCcw className="h-4 w-4" /> Restore
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      action={archiveMasterCost.bind(null, id)}
      heading={`Archive ${name}?`}
      body={`It will be hidden from lists and pickers.${
        usedInTemplates > 0 ? ` Used in ${usedInTemplates} template${usedInTemplates > 1 ? "s" : ""}.` : ""
      }`}
      confirmLabel="Archive"
      tone="neutral"
      icon="archive"
      toastMessage="Cost item archived"
      triggerClassName="btn-secondary"
    >
      <Archive className="h-4 w-4" /> Archive
    </ConfirmDialog>
  );
}
