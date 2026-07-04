"use client";

import { useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { cloneTemplate, deleteTemplate } from "@/server/actions/template-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function TemplateActions({
  id,
  name,
  productCount,
}: {
  id: string;
  name: string;
  productCount: number;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() => start(async () => { await cloneTemplate(id); })}
      >
        <Copy className="h-4 w-4" /> Clone
      </button>
      <ConfirmDialog
        action={deleteTemplate.bind(null, id)}
        heading={`Delete ${name}?`}
        body={
          productCount > 0
            ? `This can't be undone. ${productCount} product${productCount > 1 ? "s" : ""} built on it will also be deleted.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        triggerTitle="Delete template"
        triggerClassName="btn-secondary text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" /> Delete
      </ConfirmDialog>
    </div>
  );
}
