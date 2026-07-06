"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { ProductPreviewDrawer } from "./product-preview-drawer";
import { ProductFormDrawer, type TemplateOption, type MasterCostOption } from "./product-form-drawer";

// Module-level pub/sub so server-rendered rows can open the shared drawers
// without prop-drilling (mirrors components/toaster.tsx).
type OpenEvent =
  | { kind: "preview"; id: string }
  | { kind: "form"; mode: "create" | "edit"; id: string | null };
const listeners = new Set<(e: OpenEvent) => void>();

export function openProductPreview(id: string) {
  listeners.forEach((l) => l({ kind: "preview", id }));
}
export function openProductForm(mode: "create" | "edit", id: string | null) {
  listeners.forEach((l) => l({ kind: "form", mode, id }));
}

// Fired after a create/edit/delete so the client-rendered table can refetch
// without a full RSC refresh.
const changeListeners = new Set<() => void>();
export function notifyProductsChanged() {
  changeListeners.forEach((l) => l());
}
export function onProductsChanged(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

/** Clickable row cell that opens the product preview drawer. */
export function ProductRowOpen({ id, className, title, children }: { id: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} className={className} onClick={() => openProductPreview(id)}>
      {children}
    </button>
  );
}

export function ProductEditButton({ id }: { id: string }) {
  return (
    <button type="button" className="icon-btn" title="Edit" onClick={() => openProductForm("edit", id)}>
      <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
    </button>
  );
}

export function NewProductButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => openProductForm("create", null)}>
      <Plus className="h-4 w-4" /> New product
    </button>
  );
}

function Controller({
  templates,
  masterCosts,
  currency,
  editable,
}: {
  templates: TemplateOption[];
  masterCosts: MasterCostOption[];
  currency: string;
  editable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [form, setForm] = useState<{ mode: "create" | "edit"; id: string | null }>({ mode: "create", id: null });
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const l = (e: OpenEvent) => {
      if (e.kind === "preview") {
        setPreviewId(e.id);
        setPreviewOpen(true);
      } else {
        setForm({ mode: e.mode, id: e.id });
        setFormOpen(true);
      }
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  // Deep link: /products?preview=<id> auto-opens the preview drawer.
  useEffect(() => {
    const p = searchParams.get("preview");
    if (p) {
      setPreviewId(p);
      setPreviewOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Deep link: /products?new=1 auto-opens the create form (e.g. from onboarding).
  useEffect(() => {
    if (!editable || !searchParams.get("new")) return;
    setForm({ mode: "create", id: null });
    setFormOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function closePreview() {
    setPreviewOpen(false);
    if (searchParams.get("preview")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("preview");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  return (
    <>
      <ProductPreviewDrawer
        open={previewOpen}
        productId={previewId}
        editable={editable}
        onClose={closePreview}
        onEdit={(id) => {
          setPreviewOpen(false);
          setForm({ mode: "edit", id });
          setFormOpen(true);
        }}
      />
      {editable && (
        <ProductFormDrawer
          open={formOpen}
          mode={form.mode}
          productId={form.id}
          templates={templates}
          masterCosts={masterCosts}
          currency={currency}
          onClose={() => setFormOpen(false)}
          onSaved={() => notifyProductsChanged()}
        />
      )}
    </>
  );
}

export function ProductDrawers(props: {
  templates: TemplateOption[];
  masterCosts: MasterCostOption[];
  currency: string;
  editable: boolean;
}) {
  // useSearchParams needs a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <Controller {...props} />
    </Suspense>
  );
}
