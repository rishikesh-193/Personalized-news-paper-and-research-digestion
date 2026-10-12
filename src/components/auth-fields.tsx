"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Labeled text input for the auth forms. */
export function AuthField({
  id,
  label,
  ...props
}: {
  id: string;
  label: string;
} & Omit<React.ComponentProps<"input">, "id">) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input id={id} className="h-10" {...props} />
    </div>
  );
}

/** Labeled password input with a show/hide toggle button. */
export function PasswordField({
  id,
  label,
  autoComplete = "current-password",
  hint,
  ...props
}: {
  id: string;
  label: string;
  autoComplete?: string;
  hint?: React.ReactNode;
} & Omit<React.ComponentProps<"input">, "id" | "type" | "autoComplete">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="h-10 pr-11"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

/** Inline, screen-reader-friendly error message. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/** Success/info banner (e.g. "password updated"). */
export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand"
    >
      {message}
    </p>
  );
}

/** "or" divider between the password form and the Google button. */
export function OrDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-2 text-xs tracking-widest text-muted-foreground uppercase">
          or
        </span>
      </div>
    </div>
  );
}
