"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleGlyph } from "@/components/google-glyph";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  next,
  oauthFailed,
}: {
  next: string | null;
  oauthFailed: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(
    oauthFailed
      ? "Google sign-in did not complete. Please try again."
      : null,
  );

  function continueWithGoogle() {
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
        if (oauthError) setError(oauthError.message);
      } catch {
        setError("Could not reach the sign-in service. Try again in a moment.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Button
        type="button"
        size="lg"
        className="w-full gap-2.5"
        onClick={continueWithGoogle}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleGlyph />
        )}
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Google shares only your name, email address and profile picture — no
        Gmail access.
      </p>
    </div>
  );
}
