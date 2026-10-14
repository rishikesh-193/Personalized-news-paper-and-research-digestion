"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  LogOut,
  Settings,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "cn";
import { PageTransition, useEffectsPreference } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppUser } from "@/lib/auth-user";
import { signOutUser } from "@/lib/supabase/client";

/** Neutral fallback when claims carry no display name. */
const FALLBACK_NAME = "Reader";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/research", label: "Research" },
  { href: "/library", label: "Library" },
  { href: "/ask", label: "Ask" },
];

function NavLink({
  href,
  label,
  indicatorId,
}: {
  href: string;
  label: string;
  /** Separate layout group per nav, so the two navs never share one pill. */
  indicatorId: string;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  const { reduceEffects } = useEffectsPreference();

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? reduceEffects
            ? "bg-muted text-foreground"
            : "text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {/* The indicator is one element that slides between items rather than a
          background that blinks on and off. */}
      {active && !reduceEffects ? (
        <motion.span
          layoutId={indicatorId}
          className="bg-muted absolute inset-0 -z-10 rounded-lg"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <span className="relative">{label}</span>
    </Link>
  );
}

/** Nothing to subscribe to — the date only changes between renders. */
function subscribeToNothing() {
  return () => {};
}

/**
 * The reader's local date for the footer. useSyncExternalStore renders ""
 * during SSR and swaps in the real local date after hydration, so the server
 * HTML and the client tree can never disagree on a time-dependent string.
 */
function useTodayLabel() {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    () => "",
  );
}

function UserMenu({ user }: { user: AppUser | null }) {
  const router = useRouter();
  const [signingOut, startTransition] = React.useTransition();

  const name = user?.name ?? FALLBACK_NAME;
  const email = user?.email ?? "";
  const initials = user?.initials ?? FALLBACK_NAME.slice(0, 1).toUpperCase();

  function handleSignOut() {
    startTransition(async () => {
      try {
        await signOutUser();
      } finally {
        router.push("/login");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar size="sm">
          {user?.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback className="bg-brand font-medium text-brand-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">
          {name.split(" ")[0]}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {name}
              </span>
              <span className="text-xs text-muted-foreground">
                {email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onClick={() => router.push("/settings")}
        >
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-4" aria-hidden="true" />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: AppUser | null;
  children: React.ReactNode;
}) {
  const today = useTodayLabel();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-lg tracking-tight"
            aria-label="Chronicle home"
          >
            Chronicle
            <span aria-hidden="true" className="text-brand">
              .
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} indicatorId="nav-desktop" />
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-t border-border px-3 py-1.5 md:hidden"
          aria-label="Main"
        >
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} indicatorId="nav-mobile" />
          ))}
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Barely-there depth wash. Static on purpose: a moving backdrop would
            compete with the reading surface it sits under. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(55%_35%_at_50%_0%,color-mix(in_oklab,var(--caramel)_9%,transparent),transparent_75%)]"
        />
        <PageTransition>{children}</PageTransition>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Chronicle — stories summarized by AI. Check the source.</p>
          <p>{today}</p>
        </div>
      </footer>
    </div>
  );
}
