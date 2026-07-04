import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--bg)] text-center">
      <div className="text-5xl font-bold text-ink-200">404</div>
      <h1 className="text-lg font-semibold text-ink-900">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-500">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/dashboard" className="btn-primary mt-2">Back to dashboard</Link>
    </div>
  );
}
