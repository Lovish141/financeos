import Link from "next/link";
import { getMyRequests, buyerCurrency } from "@/server/actions/buyer-actions";
import { EmptyState } from "@/components/ui";
import { ClipboardList } from "lucide-react";
import { MyRequests } from "./my-requests";

export default async function MyOrdersPage() {
  const [requests, currency] = await Promise.all([getMyRequests(), buyerCurrency()]);

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-600">Your requests</div>
        <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-[-0.025em] text-ink-900">My Orders</h1>
        <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
          Track every request from submission through approval. Approved requests show your
          supplier's confirmed quantities and pricing.
        </p>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" strokeWidth={1.6} />}
          title="No requests yet"
          description="Browse the catalog and submit your first order request."
          action={
            <Link href="/portal" className="btn-primary">
              Browse catalog
            </Link>
          }
        />
      ) : (
        <MyRequests initial={requests} currency={currency} />
      )}
    </div>
  );
}
