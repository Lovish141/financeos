import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";
import { SidebarProvider } from "@/components/sidebar-context";
import { TopSearch } from "@/components/top-search";
import { TopBreadcrumb } from "@/components/top-breadcrumb";
import { Toaster } from "@/components/toaster";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { companyId, userName, userEmail, role } = await requireSession().then((s) => ({
    companyId: s.companyId,
    userName: s.name,
    userEmail: s.email,
    role: s.role,
  }));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          companyName={company?.name ?? "Company"}
          userName={userName}
          userEmail={userEmail}
          role={role}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[oklch(0.975_0.004_240_/_0.85)] px-6 backdrop-blur-md sm:px-8">
            <TopBreadcrumb company={company?.name ?? "Company"} />
            <TopSearch />
            <div className="ml-auto flex items-center gap-3.5">
              <span className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-500 lg:inline-flex">
                <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[oklch(0.6_0.11_162)]" />
                Price-book synced
              </span>
              <button
                type="button"
                title="Notifications"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-100"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-6 py-7 sm:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
