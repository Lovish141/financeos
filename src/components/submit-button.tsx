"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  brand: "btn-brand",
} as const;

export function SubmitButton({
  children,
  className,
  variant = "primary",
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof variants;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(variants[variant], className)}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingText ?? children : children}
    </button>
  );
}
