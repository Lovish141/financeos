"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createTemplate } from "@/server/actions/template-actions";
import type { ActionResult } from "@/server/actions/cost-actions";
import { Breadcrumbs, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default function NewTemplatePage() {
  const [state, action] = useActionState<ActionResult, FormData>(createTemplate, undefined);

  return (
    <div className="max-w-xl">
      <Breadcrumbs items={[{ label: "Templates", href: "/templates" }, { label: "New template" }]} />
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-ink-900">New template</h2>
        <p className="mb-4 text-sm text-ink-500">Name the product family. You&apos;ll add recipe lines next.</p>
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Template name</label>
            <input className="input" id="name" name="name" placeholder="Basin Mixer" required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="category">Category (optional)</label>
            <input className="input" id="category" name="category" placeholder="Mixers" />
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex gap-2 pt-2">
            <SubmitButton pendingText="Creating…">Create &amp; add recipe</SubmitButton>
            <Link href="/templates" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
