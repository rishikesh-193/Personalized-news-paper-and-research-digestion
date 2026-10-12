"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { AuthField, FormError } from "@/components/auth-fields";

export function ForgotPasswordForm() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  // Set once the reset email has been requested successfully.
  const [sent, setSent] = React.useState(false);
  const [resendState, setResendState] = React.useState<
    "idle" | "sending" | "sent"
  >("idle");

  function sendResetLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        },
      );
      if (resetError) {
        setError(friendlyAuthError(resetError));
        return;
      }
      setSent(true);
    });
  }

  function resendLink() {
    if (resendState === "sending") return;
    setResendState("sending");
    setError(null);
    startTransition(async () => {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        },
      );
      if (resetError) {
        setError(friendlyAuthError(resetError));
        setResendState("idle");
      } else {
        setResendState("sent");
      }
    });
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-brand/40 bg-brand/10">
          <MailCheck className="size-6 text-brand" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-2xl tracking-tight">
            Check your email
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for{" "}
            <span className="font-medium text-foreground">{email}</span>, we
            sent a link to set a new password.
          </p>
        </div>
        <FormError message={error} />
        {resendState === "sent" ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Link sent again — check your inbox (and spam folder).
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={resendLink}
            disabled={pending || resendState === "sending"}
            aria-busy={pending}
          >
            {resendState === "sending" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {resendState === "sending" ? "Sending…" : "Resend email"}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />
      <form onSubmit={sendResetLink} className="space-y-4" noValidate>
        <AuthField
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {pending ? "Sending link…" : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
