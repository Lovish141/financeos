"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, ShoppingCart, Loader2, Trash2, Package, Check, X } from "lucide-react";
import { submitOrderRequest, type CatalogProduct } from "@/server/actions/buyer-actions";
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from "@/components/drawer";
import { toast } from "@/components/toaster";
import { EmptyState } from "@/components/ui";
import { categoryColor, cn } from "@/lib/utils";

function useMoney(currency: string) {
  return useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }),
    [currency],
  );
}

const ALL = "__all__";

/** Monogram tile standing in for a product photo — tinted by its series. */
function ProductThumb({ product }: { product: CatalogProduct }) {
  const c = categoryColor(product.seriesName || product.name);
  const initials = product.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="relative flex h-20 items-center justify-center overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${c.bg}, oklch(0.99 0.004 240))` }}
    >
      <span className="text-[22px] font-extrabold tracking-[-0.03em]" style={{ color: c.color }}>
        {initials || <Package className="h-6 w-6" strokeWidth={1.7} />}
      </span>
    </div>
  );
}

export function CatalogOrder({ catalog, currency }: { catalog: CatalogProduct[]; currency: string }) {
  const router = useRouter();
  const money = useMoney(currency);
  const [q, setQ] = useState("");
  const [series, setSeries] = useState<string>(ALL);
  const [cart, setCart] = useState<Record<string, number>>({}); // productId -> qty
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Distinct series → the storefront's category filter.
  const seriesList = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog) if (p.seriesName?.trim()) set.add(p.seriesName.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.filter((p) => {
      if (series !== ALL && (p.seriesName?.trim() || "") !== series) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.productCode?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [catalog, q, series]);

  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartCount = cartLines.reduce((s, [, qty]) => s + qty, 0);
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
    <>
      {/* Sticky toolbar: search + category chips + cart trigger */}
      <div className="sticky top-[62px] z-20 -mx-5 mb-5 border-b border-[var(--border)] bg-[oklch(0.985_0.003_240)]/85 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-10"
              placeholder="Search products by name, SKU or code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="btn-primary relative shrink-0"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] font-bold tabular-nums">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {seriesList.length > 0 && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            <CategoryChip label="All" active={series === ALL} onClick={() => setSeries(ALL)} />
            {seriesList.map((s) => (
              <CategoryChip key={s} label={s} active={series === s} onClick={() => setSeries(s)} />
            ))}
          </div>
        )}
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-ink-400">
          No products match your search.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => {
            const qty = cart[p.id] ?? 0;
            const c = categoryColor(p.seriesName || p.name);
            return (
              <div key={p.id} className={cn("card flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-card", qty > 0 && "ring-2 ring-brand-300")}>
                <div className="relative">
                  <ProductThumb product={p} />
                  {p.seriesName && (
                    <span
                      className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: c.bg, color: c.color }}
                    >
                      {p.seriesName}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <div className="min-h-[34px] text-[13.5px] font-semibold leading-tight text-ink-900">
                    {p.name}
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] text-ink-400">{p.productCode || p.sku}</div>
                  <div className="mt-2.5 flex items-baseline gap-1">
                    <span className="text-[15px] font-bold text-ink-900">{money.format(p.sellingPrice)}</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-400">/ unit</span>
                  </div>

                  <div className="mt-3">
                    {qty > 0 ? (
                      <div className="flex items-center justify-between gap-1.5">
                        <button type="button" onClick={() => bump(p.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          className="input h-8 w-full px-1 text-center"
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
                      <button type="button" onClick={() => bump(p.id, 1)} className="btn-ghost w-full justify-center">
                        <Plus className="h-4 w-4" /> Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart slide-in */}
      <Drawer open={cartOpen} onClose={() => setCartOpen(false)} width={440}>
        <DrawerHeader onClose={() => setCartOpen(false)}>
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="h-[18px] w-[18px] text-brand-600" />
            <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-ink-900">Your request</h3>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-500">
            {cartCount === 0 ? "Nothing added yet" : `${cartCount} item${cartCount !== 1 ? "s" : ""} across ${cartLines.length} product${cartLines.length !== 1 ? "s" : ""}`}
          </p>
        </DrawerHeader>

        <DrawerBody>
          {cartLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
                <ShoppingCart className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <p className="max-w-[220px] text-[13px] text-ink-400">
                Browse the catalog and add products to build your request.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartLines.map(([id, qty]) => {
                const p = byId.get(id)!;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink-800">{p.name}</div>
                      <div className="font-mono text-[10.5px] text-ink-400">{money.format(p.sellingPrice)} / unit</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => bump(id, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        className="input h-7 w-12 px-1 text-center text-[13px]"
                        type="number"
                        min="0"
                        step="any"
                        value={qty}
                        onChange={(e) => setQty(id, Number(e.target.value))}
                      />
                      <button type="button" onClick={() => bump(id, 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="w-[68px] shrink-0 text-right text-[13px] font-bold text-ink-900">
                      {money.format(p.sellingPrice * qty)}
                    </div>
                    <button type="button" onClick={() => setQty(id, 0)} title="Remove" className="shrink-0 text-ink-300 transition-colors hover:text-risk-500">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                );
              })}

              <div className="border-t border-ink-100 pt-4">
                <label className="label">Note to supplier (optional)</label>
                <textarea
                  className="input min-h-[68px] resize-y"
                  placeholder="Delivery timing, packaging, anything they should know…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <p className="text-[11px] leading-relaxed text-ink-400">
                Prices are indicative — your supplier confirms final pricing when they approve.
              </p>

              {error && <p className="text-sm text-risk-500">{error}</p>}
            </div>
          )}
        </DrawerBody>

        <DrawerFooter className="flex-col items-stretch gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-500">Est. total</span>
            <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink-900">{money.format(cartTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCartOpen(false)} className="btn-ghost shrink-0">
              <X className="h-4 w-4" /> Keep browsing
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || cartLines.length === 0}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active ? "border-transparent bg-ink-800 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
      )}
    >
      {label}
    </button>
  );
}
