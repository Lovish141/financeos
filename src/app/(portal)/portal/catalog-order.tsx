"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, ShoppingCart, Loader2, Trash2, Package } from "lucide-react";
import { submitOrderRequest, type CatalogProduct } from "@/server/actions/buyer-actions";
import { toast } from "@/components/toaster";
import { EmptyState } from "@/components/ui";

function useMoney(currency: string) {
  return useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }),
    [currency],
  );
}

export function CatalogOrder({ catalog, currency }: { catalog: CatalogProduct[]; currency: string }) {
  const router = useRouter();
  const money = useMoney(currency);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({}); // productId -> qty
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return catalog;
    return catalog.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  }, [catalog, q]);

  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartTotal = cartLines.reduce((s, [id, qty]) => s + (byId.get(id)?.sellingPrice ?? 0) * qty, 0);

  function setQty(id: string, qty: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));
  }
  function bump(id: string, delta: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));
  }

  async function submit() {
    setError(null);
    if (cartLines.length === 0) return setError("Add at least one product to your request.");
    setSaving(true);
    const fd = new FormData();
    fd.set("buyerNote", note);
    fd.set("items", JSON.stringify(cartLines.map(([productId, quantity]) => ({ productId, quantity }))));
    const res = await submitOrderRequest(undefined, fd);
    setSaving(false);
    if (res?.error) return setError(res.error);
    toast("Order request submitted");
    router.push("/portal/orders");
  }

  if (catalog.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-7 w-7" strokeWidth={1.6} />}
        title="No products available yet"
        description="Your supplier hasn't published any products to order. Check back soon."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Catalog list */}
      <div>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder="Search products by name or SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          {filtered.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className="card flex items-center gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-ink-900">{p.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-ink-400">{p.sku}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold text-ink-900">{money.format(p.sellingPrice)}</div>
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">list price</div>
                </div>
                {qty > 0 ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => bump(p.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      className="input h-8 w-14 px-1 text-center"
                      type="number"
                      min="0"
                      step="any"
                      value={qty}
                      onChange={(e) => setQty(p.id, Number(e.target.value))}
                    />
                    <button type="button" onClick={() => bump(p.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => bump(p.id, 1)} className="btn-ghost shrink-0">
                    <Plus className="h-4 w-4" /> Add
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card px-6 py-10 text-center text-sm text-ink-400">No products match “{q}”.</div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:sticky lg:top-[86px] lg:self-start">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
            <ShoppingCart className="h-4 w-4" /> Your request
          </div>
          {cartLines.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-400">Add products to build your request.</p>
          ) : (
            <div className="space-y-2.5">
              {cartLines.map(([id, qty]) => {
                const p = byId.get(id)!;
                return (
                  <div key={id} className="flex items-center gap-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink-800">{p.name}</div>
                      <div className="font-mono text-[10.5px] text-ink-400">
                        {qty} × {money.format(p.sellingPrice)}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-ink-900">{money.format(p.sellingPrice * qty)}</span>
                    <button type="button" onClick={() => setQty(id, 0)} title="Remove" className="shrink-0 text-ink-300 transition-colors hover:text-risk-500">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                );
              })}
              <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-500">Est. total</span>
                <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink-900">{money.format(cartTotal)}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-400">
                Indicative — your supplier confirms final pricing on approval.
              </p>
            </div>
          )}

          <div className="mt-4">
            <label className="label">Note (optional)</label>
            <textarea
              className="input min-h-[68px] resize-y"
              placeholder="Anything your supplier should know…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="mt-3 text-sm text-risk-500">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={saving || cartLines.length === 0}
            className="btn-primary mt-4 w-full justify-center"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}
