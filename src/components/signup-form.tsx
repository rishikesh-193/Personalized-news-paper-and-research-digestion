"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGlyph } from "@/components/google-glyph";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError, isRateLimitError } from "@/lib/auth-errors";
import {
  AuthField,
  FormError,
  OrDivider,
  PasswordField,
} from "@/components/auth-fields";

const MIN_PASSWORD_LENGTH = 8;
const RATE_LIMIT_COOLDOWN_SECONDS = 60;

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

  // Cooldown timers to prevent repeated submissions when rate-limited.
  const [cooldown, setCooldown] = React.useState<number>(0);
  const [resendCooldown, setResendCooldown] = React.useState<number>(0);

  // Synchronous guard against rapid double-clicks and repeated submissions.
  const isSubmittingRef = React.useRef(false);

  // Active countdown timer for signup rate limits.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Active countdown timer for email resend cooldown.
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  function continueWithGoogle() {
    if (isSubmittingRef.current || pending) return;
    isSubmittingRef.current = true;
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
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  function signUpWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current || pending || cooldown > 0) return;
    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
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

    isSubmittingRef.current = true;
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: { full_name: trimmedName },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });

        if (signUpError) {
          setError(friendlyAuthError(signUpError));
          if (isRateLimitError(signUpError)) {
            setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
          }
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

        setConfirmationSentTo(trimmedEmail);
      } catch {
        setError("Could not complete sign-up. Try again in a moment.");
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  function resendConfirmation() {
    if (
      resendState === "sending" ||
      resendCooldown > 0 ||
      isSubmittingRef.current ||
      !confirmationSentTo
    ) {
      return;
    }
    isSubmittingRef.current = true;
    setResendState("sending");
    setError(null);
    startTransition(async () => {
      try {
        const { error: resendError } = await createClient().auth.resend({
          type: "signup",
          email: confirmationSentTo,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        if (resendError) {
          setError(friendlyAuthError(resendError));
          setResendState("idle");
          if (isRateLimitError(resendError)) {
            setResendCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
          }
        } else {
          setResendState("sent");
          setResendCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
        }
      } catch {
        setError("Could not resend email. Try again shortly.");
        setResendState("idle");
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  if (confirmationSentTo) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-brand/40 bg-brand/10">
          <MailCheck className="size-5 text-brand" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-heading text-xl tracking-tight text-foreground sm:text-2xl">
            Check your email
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">
              {confirmationSentTo}
            </span>
            . Click it to activate your account.
          </p>
        </div>

        <FormError
          message={
            resendCooldown > 0
              ? `Email rate limit in effect. You can request another email in ${resendCooldown}s.`
              : error
          }
        />

        {resendState === "sent" && resendCooldown <= 0 ? (
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground sm:text-sm"
          >
            Link sent again — check your inbox (and spam folder).
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full text-xs sm:h-10 sm:text-sm"
            onClick={resendConfirmation}
            disabled={pending || resendState === "sending" || resendCooldown > 0}
            aria-busy={pending || resendState === "sending"}
          >
            {resendState === "sending" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {resendState === "sending"
              ? "Sending…"
              : resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Resend email"}
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Wrong address?{" "}
          <button
            type="button"
            onClick={() => {
              setConfirmationSentTo(null);
              setResendState("idle");
              setError(null);
              setResendCooldown(0);
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        </p>
      </div>
    );
  }

  const displayedError =
    cooldown > 0
      ? `Too many emails sent too quickly. Please wait ${cooldown}s before trying again.`
      : error;

  return (
    <div className="space-y-4">
      {displayedError ? (
        <div className="space-y-2">
          <FormError message={displayedError} />
          {cooldown > 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tip: You can{" "}
              <strong className="font-medium text-foreground">
                Sign in with Google
              </strong>{" "}
              below to get started immediately without waiting for an email.
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={signUpWithPassword} className="space-y-3" noValidate>
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
          className="mt-1 h-9.5 w-full text-xs font-medium sm:h-10 sm:text-sm"
          disabled={pending || cooldown > 0}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {pending
            ? "Creating account…"
            : cooldown > 0
              ? `Wait ${cooldown}s to retry`
              : "Create account"}
        </Button>
      </form>

      <OrDivider />

      <Button
        type="button"
        variant="outline"
        className="h-9.5 w-full gap-2.5 text-xs font-medium sm:h-10 sm:text-sm"
        onClick={continueWithGoogle}
        disabled={pending}
      >
        <GoogleGlyph />
        Sign in with Google
      </Button>

      <p className="text-center text-[11px] leading-tight text-muted-foreground">
        Google shares only your name, email address and profile picture — no
        Gmail access.
      </p>
    </div>
  );
}
