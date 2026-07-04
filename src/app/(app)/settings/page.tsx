import { requireSession, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { companyId, role, name, email } = await requireSession();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const admin = isAdmin(role);

  return (
    <div className="max-w-3xl animate-fade-up">
      <PageHeader eyebrow="Company" title="Settings" description="Company profile, units, and margin thresholds." />

      <section className="card mb-5 p-0">
        <div className="border-b border-[var(--border)] px-[22px] py-[15px]">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-500">Your account</h3>
        </div>
        <AccountRow label="Name" value={name ?? "—"} />
        <AccountRow label="Email" value={email} mono />
        <AccountRow label="Role" value={<Badge tone="brand">{role.replace("_", " ")}</Badge>} />
      </section>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-[22px] py-[15px]">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-500">Company settings</h3>
          {!admin && (
            <span className="chip bg-watch-50 text-watch-500 ring-1 ring-inset ring-watch-500/15">Admin only</span>
          )}
        </div>
        <SettingsForm
          disabled={!admin}
          initial={{
            name: company.name,
            baseCurrency: company.baseCurrency,
            weightUnit: company.weightUnit,
            marginRedThreshold: company.marginRedThreshold,
            marginYellowThreshold: company.marginYellowThreshold,
            stalenessDays: company.stalenessDays,
          }}
        />
      </section>
    </div>
  );
}

function AccountRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-[22px] py-[14px] last:border-0">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">{label}</span>
      <span className={`text-[13.5px] font-semibold text-ink-900 ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</span>
    </div>
  );
}
