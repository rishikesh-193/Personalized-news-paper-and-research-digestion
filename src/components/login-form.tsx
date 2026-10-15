"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGlyph } from "@/components/google-glyph";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import {
  AuthField,
  FormError,
  FormNotice,
  OrDivider,
  PasswordField,
} from "@/components/auth-fields";

export function LoginForm({
  next,
  oauthFailed,
  resetSuccess,
}: {
  next: string | null;
  oauthFailed: boolean;
  resetSuccess?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(
    oauthFailed
      ? "Google sign-in did not complete. Please try again."
      : null,
  );
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const router = useRouter();
  const isSubmittingRef = React.useRef(false);

  function continueWithGoogle() {
    if (isSubmittingRef.current || pending) return;
    isSubmittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/today")}`;
        const { error: oauthError } = await createClient().auth.signInWithOAuth(
          {
            provider: "google",
            options: {
              scopes: "openid email profile",
              redirectTo,
            },
          },
        );
        if (oauthError) setError(friendlyAuthError(oauthError));
      } catch {
        setError("Could not reach the sign-in service. Try again in a moment.");
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current || pending) return;
    isSubmittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const { error: signInError } = await createClient().auth.signInWithPassword(
          { email, password },
        );
        if (signInError) {
          setError(friendlyAuthError(signInError));
          return;
        }
        // Route by profiles.onboarded on the server (getClaims-verified).
        router.push(
          `/auth/post-login?next=${encodeURIComponent(next ?? "/today")}`,
        );
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  return (
    <div className="space-y-5">
      {resetSuccess ? (
        <FormNotice message="Password updated. Sign in with your new password." />
      ) : null}
      <FormError message={error} />

      <form onSubmit={signInWithPassword} className="space-y-4" noValidate>
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
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          }
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
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <OrDivider />

      <Button
        type="button"
        size="lg"
        variant="outline"
        className="w-full gap-2.5"
        onClick={continueWithGoogle}
        disabled={pending}
      >
        <GoogleGlyph />
        Sign in with Google
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Google shares only your name, email address and profile picture — no
        Gmail access.
      </p>
    </div>
  );
}
