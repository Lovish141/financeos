"use client";

import { useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { cloneProduct, deleteProduct } from "@/server/actions/product-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ProductActions({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => { await cloneProduct(id); })}>
        <Copy className="h-4 w-4" /> Clone
      </button>
      <ConfirmDialog
        action={deleteProduct.bind(null, id)}
        heading={`Delete ${name}?`}
        body="This can't be undone."
        confirmLabel="Delete"
        triggerTitle="Delete"
        triggerClassName="btn-secondary text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </ConfirmDialog>
    </>
  );
}
