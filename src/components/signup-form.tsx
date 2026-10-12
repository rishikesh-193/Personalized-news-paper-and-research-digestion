"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGlyph } from "@/components/google-glyph";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import {
  AuthField,
  FormError,
  OrDivider,
  PasswordField,
} from "@/components/auth-fields";

const MIN_PASSWORD_LENGTH = 8;

export function SignupForm({ oauthFailed }: { oauthFailed: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(
    oauthFailed ? "Google sign-in did not complete. Please try again." : null,
  );
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  // Set when Supabase returns no session (email confirmation is on).
  const [confirmationSentTo, setConfirmationSentTo] = React.useState<
    string | null
  >(null);
  const [resendState, setResendState] = React.useState<
    "idle" | "sending" | "sent"
  >("idle");

  function continueWithGoogle() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const { error: oauthError } = await createClient().auth.signInWithOAuth(
          {
            provider: "google",
            options: {
              scopes: "openid email profile",
              redirectTo: `${window.location.origin}/auth/callback?next=/today`,
            },
          },
        );
        if (oauthError) setError(friendlyAuthError(oauthError));
      } catch {
        setError("Could not reach the sign-in service. Try again in a moment.");
      }
    });
  }

  function signUpWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });

      if (signUpError) {
        setError(friendlyAuthError(signUpError));
        return;
      }

      // Email confirmation is OFF in Supabase: a session came back, so skip
      // the "check your email" screen and route by profiles.onboarded.
      if (data.session) {
        router.push("/auth/post-login?next=/onboarding");
        return;
      }

      // Supabase hides "user already exists" when confirmations are on; an
      // anonymous user with no identities is the tell.
      if (data.user && data.user.identities?.length === 0) {
        setError(
          "An account with this email already exists. Try signing in instead.",
        );
        return;
      }

      setConfirmationSentTo(email);
    });
  }

  function resendConfirmation() {
    if (resendState === "sending") return;
    setResendState("sending");
    setError(null);
    startTransition(async () => {
      const { error: resendError } = await createClient().auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (resendError) {
        setError(friendlyAuthError(resendError));
        setResendState("idle");
      } else {
        setResendState("sent");
      }
    });
  }

  if (confirmationSentTo) {
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
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">
              {confirmationSentTo}
            </span>
            . Click it to activate your account.
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
            onClick={resendConfirmation}
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
          Wrong address?{" "}
          <button
            type="button"
            onClick={() => {
              setConfirmationSentTo(null);
              setResendState("idle");
              setError(null);
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />

      <form onSubmit={signUpWithPassword} className="space-y-4" noValidate>
        <AuthField
          id="full-name"
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm password"
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
          {pending ? "Creating account…" : "Create account"}
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
