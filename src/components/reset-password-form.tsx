"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { FormError, PasswordField } from "@/components/auth-fields";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const router = useRouter();

  function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      // Uses the recovery session created by /auth/confirm's verifyOtp.
      const { error: updateError } = await createClient().auth.updateUser({
        password,
      });
      if (updateError) {
        setError(friendlyAuthError(updateError));
        return;
      }
      router.push("/login?reset=success");
    });
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />
      <form onSubmit={savePassword} className="space-y-4" noValidate>
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
          {pending ? "Saving password…" : "Save password"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Link expired?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Request a new one
        </Link>
      </p>
    </div>
  );
}
