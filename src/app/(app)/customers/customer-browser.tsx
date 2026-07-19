"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Archive, RotateCcw, Users } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMoney } from "@/lib/utils";
import {
  archiveCustomer,
  restoreCustomer,
  searchCustomers,
  type CustomerListItem,
} from "@/server/actions/customer-actions";
import { CustomerRowOpen, CustomerEditButton, NewCustomerButton, onCustomersChanged } from "./customer-drawers";
import type { SalesChannel } from "@prisma/client";

const GRID = "1.6fr 1.4fr 1fr 0.7fr 0.8fr 1fr 74px";

const CHANNEL_LABEL: Record<SalesChannel, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  DISTRIBUTOR: "Distributor",
  EXPORT: "Export",
  ONLINE: "Online",
  OTHER: "Other",
};

export function CustomerBrowser({
  initialItems,
  currency,
  editable,
  initialQuery,
  initialArchived,
}: {
  initialItems: CustomerListItem[];
  currency: string;
  editable: boolean;
  initialQuery: string;
  initialArchived: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [archived, setArchived] = useState(initialArchived);
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  const firstRender = useRef(true);
  const reqId = useRef(0);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchCustomers({ q, archived });
      if (id === reqId.current) {
        setItems(rows);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, archived]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (archived) params.set("archived", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/customers?${qs}` : "/customers");
  }, [q, archived]);

  async function refetch() {
    const id = ++reqId.current;
    const rows = await searchCustomers({ q, archived });
    if (id === reqId.current) setItems(rows);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onCustomersChanged(refetch), [q, archived]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className="text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
          >
            {archived ? "← Active customers" : "View archived"}
          </button>
          <div className="search-box w-[240px]">
            {loading ? (
              <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin text-brand-500" />
            ) : (
              <Search className="h-[15px] w-[15px] shrink-0 text-ink-400" strokeWidth={2} />
            )}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, city, GSTIN" autoComplete="off" />
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title={archived ? "No archived customers" : q ? "No customers match your search" : "No customers yet"}
          description={
            q
              ? "Try a different search term."
              : archived
                ? "Customers you archive show up here. You can restore them anytime."
                : "Add the customers you sell to — then link them when recording sales."
          }
          action={editable && !archived && !q && <NewCustomerButton />}
        />
      ) : (
        <div className={`card overflow-hidden p-0 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
          <div
            className="grid gap-3 border-b border-[var(--border)] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <span>Customer</span>
            <span>Contact</span>
            <span>Channel</span>
            <span className="text-right">Orders</span>
            <span className="text-right">Units</span>
            <span className="text-right">Revenue</span>
            <span />
          </div>

          {items.map((c) => (
            <div
              key={c.id}
              className="grid items-center gap-3 border-b border-[var(--border)] px-[22px] py-[14px] transition-colors last:border-0 hover:bg-ink-50/60"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="flex min-w-0 flex-col">
                <CustomerRowOpen id={c.id} title={c.name} className="truncate text-left text-[14px] font-semibold text-ink-900 hover:text-brand-700">
                  {c.name}
                </CustomerRowOpen>
                {c.city && <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400" title={c.city}>{c.city}</span>}
              </div>
              <div className="min-w-0 truncate text-[12.5px] text-ink-600" title={c.email ?? c.phone ?? ""}>
                {c.email ?? c.phone ?? <span className="text-ink-300">—</span>}
              </div>
              <div className="text-[12.5px] text-ink-600">
                {c.channel ? CHANNEL_LABEL[c.channel] : <span className="text-ink-300">—</span>}
              </div>
              <div className="text-right font-mono text-[13px] text-ink-600">{c.orders.toLocaleString("en-IN")}</div>
              <div className="text-right font-mono text-[13px] text-ink-600">{c.unitsSold.toLocaleString("en-IN")}</div>
              <div className="text-right font-mono text-[13px] font-semibold text-ink-900">{formatMoney(c.revenue, currency)}</div>
              <div className="flex justify-end gap-1.5">
                {editable && !archived && (
                  <CustomerEditButton
                    initial={{ id: c.id, name: c.name, email: c.email, phone: c.phone, channel: c.channel, gstin: c.gstin, city: c.city, notes: c.notes }}
                  />
                )}
                {editable && (
                  <ConfirmDialog
                    action={(archived ? restoreCustomer : archiveCustomer).bind(null, c.id)}
                    heading={archived ? `Restore ${c.name}?` : `Archive ${c.name}?`}
                    body={
                      archived
                        ? "They will reappear in lists and the sale customer picker."
                        : "They will be hidden from lists and the sale picker. Existing sales keep their link."
                    }
                    confirmLabel={archived ? "Restore" : "Archive"}
                    tone={archived ? "neutral" : "danger"}
                    icon={archived ? "restore" : "archive"}
                    toastMessage={archived ? "Customer restored" : "Customer archived"}
                    onConfirmed={refetch}
                    triggerTitle={archived ? "Restore" : "Archive"}
                    triggerClassName={`icon-btn ${archived ? "" : "icon-btn-danger"}`}
                  >
                    {archived ? <RotateCcw className="h-[15px] w-[15px]" strokeWidth={1.9} /> : <Archive className="h-[15px] w-[15px]" strokeWidth={1.9} />}
                  </ConfirmDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
