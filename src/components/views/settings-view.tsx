"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2, Moon, Sun } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currentUser, topics } from "@/lib/mock-data";
import type { AppUser } from "@/lib/auth-user";
import { signOutUser } from "@/lib/supabase/client";
import { saveInterestsAction } from "@/lib/interests-actions";

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function SettingsView({
  user,
  initialInterests,
}: {
  user: AppUser | null;
  /** Saved interests from the database; null = the load failed. */
  initialInterests: string[] | null;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [signingOut, startSigningOut] = React.useTransition();
  const [saving, startSaving] = React.useTransition();
  const [interests, setInterests] = React.useState<string[]>(
    initialInterests ?? [],
  );
  const [savedNote, setSavedNote] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const noteTimerRef = React.useRef<number | undefined>(undefined);
  const availableTopics = [
    ...topics,
    ...(initialInterests ?? []).filter((topic) => !topics.includes(topic)),
  ];
  const account = {
    name: user?.name ?? currentUser.name,
    email: user?.email ?? currentUser.email,
    initials: user?.initials ?? currentUser.initials,
    avatarUrl: user?.avatarUrl,
  };

  React.useEffect(
    () => () => {
      if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    },
    [],
  );

  function toggleInterest(topic: string) {
    setInterests((prev) =>
      prev.includes(topic)
        ? prev.filter((item) => item !== topic)
        : [...prev, topic],
    );
  }

  function saveInterests() {
    setSaveError(null);
    startSaving(async () => {
      try {
        const result = await saveInterestsAction(interests);
        if (!result.ok) {
          setSaveError(
            result.error ?? "Could not save your interests. Try again.",
          );
          return;
        }
        setSavedNote(true);
        if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
        noteTimerRef.current = window.setTimeout(
          () => setSavedNote(false),
          2500,
        );
      } catch {
        setSaveError("Could not save your interests. Try again.");
      }
    });
  }

  function handleSignOut() {
    startSigningOut(async () => {
      try {
        await signOutUser();
      } finally {
        router.push("/login");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appearance, account and the topics that shape your edition.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>The paper you like to read on.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {themeOptions.map((option) => {
            const active = resolvedTheme === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-brand text-foreground ring-1 ring-brand"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {user
              ? "Signed in with Google."
              : "Local demo profile — nothing is synced yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar size="lg">
            {account.avatarUrl ? (
              <AvatarImage src={account.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="bg-brand font-medium text-brand-foreground">
              {account.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{account.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {account.email}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-brand/40 text-brand"
          >
            {user ? "Google connected" : "Google not connected"}
          </Badge>
        </CardContent>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            {user
              ? "Your session is managed by Supabase Auth with Google."
              : "Sign in with Google arrives next; until then this profile lives only in your browser."}
          </p>
          <Button
            variant="outline"
            className="mt-3 gap-2"
            disabled={!user || signingOut}
            onClick={handleSignOut}
          >
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interests</CardTitle>
          <CardDescription>
            Shapes which stories lead your Today edition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initialInterests === null ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Couldn’t load your interests from Supabase. Run the migration in
              the SQL editor, then reload this page.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {availableTopics.map((topic) => {
                  const active = interests.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleInterest(topic)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                        active
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={saveInterests}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {saving ? "Saving…" : "Save interests"}
                </Button>
                <p
                  className="text-sm text-brand"
                  role="status"
                  aria-live="polite"
                >
                  {savedNote ? "Interests saved." : ""}
                </p>
                {saveError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {saveError}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
