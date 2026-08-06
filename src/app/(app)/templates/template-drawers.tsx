"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Copy, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/action-menu";
import { cloneTemplate, deleteTemplate } from "@/server/actions/template-actions";
import { TemplatePreviewDrawer } from "./template-preview-drawer";
import { TemplateFormDrawer, type MasterCostOption } from "./template-form-drawer";

// Module-level pub/sub so server/client-rendered cards can open the shared
// drawers without prop-drilling (mirrors products/product-drawers.tsx).
type OpenEvent =
  | { kind: "preview"; id: string }
  | { kind: "form"; mode: "create" | "edit"; id: string | null };
const listeners = new Set<(e: OpenEvent) => void>();

export function openTemplatePreview(id: string) {
  listeners.forEach((l) => l({ kind: "preview", id }));
}
export function openTemplateForm(mode: "create" | "edit", id: string | null) {
  listeners.forEach((l) => l({ kind: "form", mode, id }));
}

// Fired after a create/edit/clone/delete so the client card grid can refetch.
const changeListeners = new Set<() => void>();
export function notifyTemplatesChanged() {
  changeListeners.forEach((l) => l());
}
export function onTemplatesChanged(cb: () => void) {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export function TemplateRowOpen({ id, className, title, children }: { id: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} className={className} onClick={() => openTemplatePreview(id)}>
      {children}
    </button>
  );
}

/**
 * Every per-template action behind one "⋯" menu. Duplicating copies the recipe
 * and its version-1 snapshot; deleting takes the products built on it with it,
 * so the confirm body spells that out.
 */
export function TemplateRowActions({
  id,
  name,
  productCount,
  onChanged,
}: {
  id: string;
  name: string;
  productCount: number;
  onChanged?: () => void;
}) {
  return (
    <ActionMenu
      label="Template actions"
      items={[
        { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openTemplateForm("edit", id) },
        {
          key: "clone",
          label: "Duplicate",
          icon: Copy,
          onSelect: async () => {
            const res = await cloneTemplate(id);
            if (res.ok) notifyTemplatesChanged();
          },
        },
        {
          key: "delete",
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          confirm: {
            action: deleteTemplate.bind(null, id),
            heading: `Delete ${name}?`,
            body:
              productCount > 0
                ? `This can't be undone. ${productCount} product${productCount > 1 ? "s" : ""} built on it will also be deleted.`
                : "This can't be undone.",
            confirmLabel: "Delete",
            onConfirmed: onChanged,
          },
        },
      ]}
    />
  );
}

export function NewTemplateButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => openTemplateForm("create", null)}>
      <Plus className="h-4 w-4" /> New template
    </button>
  );
}

function Controller({
  masterCosts,
  currency,
  weightUnit,
  editable,
}: {
  masterCosts: MasterCostOption[];
  currency: string;
  weightUnit: string;
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

  // Deep link: /templates?preview=<id> opens the preview drawer (e.g. from search).
  useEffect(() => {
    const p = searchParams.get("preview");
    if (p) {
      setPreviewId(p);
      setPreviewOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Deep link: /templates?new=1 opens the create form (e.g. from onboarding).
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
      <TemplatePreviewDrawer
        open={previewOpen}
        templateId={previewId}
        editable={editable}
        onClose={closePreview}
        onEdit={(id) => {
          setPreviewOpen(false);
          setForm({ mode: "edit", id });
          setFormOpen(true);
        }}
      />
      {editable && (
        <TemplateFormDrawer
          open={formOpen}
          mode={form.mode}
          templateId={form.id}
          masterCosts={masterCosts}
          currency={currency}
          weightUnit={weightUnit}
          onClose={() => setFormOpen(false)}
          onSaved={() => notifyTemplatesChanged()}
        />
      )}
    </>
  );
}

export function TemplateDrawers(props: {
  masterCosts: MasterCostOption[];
  currency: string;
  weightUnit: string;
  editable: boolean;
}) {
  // useSearchParams needs a Suspense boundary in Next 15.
  return (
    <Suspense fallback={null}>
      <Controller {...props} />
    </Suspense>
  );
}
