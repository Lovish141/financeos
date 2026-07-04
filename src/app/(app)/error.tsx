"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-ink-500">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <button onClick={reset} className="btn-primary">Try again</button>
    </div>
  );
}
