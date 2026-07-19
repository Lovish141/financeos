import { requireBuyer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PortalNav } from "@/components/portal-nav";
import { Toaster } from "@/components/toaster";

/** Buyer portal shell — external wholesalers/dealers/retailers. Staff are bounced. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { companyId, customerId, name, email } = await requireBuyer();

  const [company, customer] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-[oklch(0.985_0.003_240)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[62px] max-w-5xl items-center gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[oklch(0.3_0.03_175)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(0.9 0.05 168)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V5M4 14l5-4 4 3 7-7" />
              </svg>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-ink-900">
                {company?.name ?? "Supplier"}
              </div>
              <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400">
                Ordering portal
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[13px] font-semibold text-ink-800">{customer?.name}</div>
              <div className="truncate font-mono text-[10px] text-ink-400">{name ?? email}</div>
            </div>
            <PortalNav />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">{children}</main>
      <Toaster />
    </div>
  );
}
