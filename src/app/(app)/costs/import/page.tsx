"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Download } from "lucide-react";
import { importMasterCostsCsv, type ImportResult } from "@/server/actions/cost-actions";
import { Breadcrumbs, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toaster";

const TEMPLATE_CSV = `name,type,unit,cost,category
Brass Ingot,raw_material,kg,720,Metal
Chrome Plating,service,piece,45,Finishing
Aerator,component,piece,12,Fittings`;

export default function ImportPage() {
  const [result, action] = useActionState<ImportResult | undefined, FormData>(
    importMasterCostsCsv,
    undefined,
  );

  useEffect(() => {
    if (result?.ok && result.imported > 0) {
      toast(`Imported ${result.imported} cost item${result.imported > 1 ? "s" : ""}`);
    }
  }, [result]);

  const templateHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(TEMPLATE_CSV);

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{ label: "Master Costs", href: "/costs" }, { label: "Import CSV" }]} />
      <Card>
        <h2 className="text-lg font-semibold text-ink-900">Import price list</h2>
        <p className="mt-1 text-sm text-ink-500">
          Upload a CSV with columns <code className="rounded bg-ink-100 px-1">name, type, unit, cost</code> (and
          optional <code className="rounded bg-ink-100 px-1">category</code>). Invalid rows are reported by line
          number; valid rows still import.
        </p>

        <a href={templateHref} download="master-costs-template.csv" className="btn-ghost mt-3 inline-flex">
          <Download className="h-4 w-4" /> Download template
        </a>

        <form action={action} className="mt-4 space-y-4">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-ink-600 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink-800"
          />
          <SubmitButton pendingText="Importing…">Import</SubmitButton>
        </form>

        {result && (
          <div className="mt-6 space-y-3">
            {result.imported > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Imported {result.imported} cost item{result.imported > 1 ? "s" : ""}.
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" /> {result.errors.length} row(s) skipped
                </div>
                <ul className="ml-6 list-disc space-y-0.5">
                  {result.errors.map((e, i) => (
                    <li key={i}>Line {e.line}: {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.imported > 0 && (
              <Link href="/costs" className="btn-primary inline-flex">View price book</Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
