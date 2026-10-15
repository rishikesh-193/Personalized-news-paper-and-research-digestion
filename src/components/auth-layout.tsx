import type * as React from "react";
import Link from "next/link";
import { AuthNewspaper } from "@/components/AuthNewspaper";
import { AuthEntrance } from "@/components/auth-entrance";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Split-screen auth shell used by /login, /signup, /forgot-password and
 * /reset-password: centered form column on the left (max width ~400px),
 * full-height artwork on the right, hidden below the md breakpoint.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2 lg:grid-cols-[1.05fr_0.95fr] xl:grid-cols-2">
      <div className="flex min-h-screen flex-col overflow-y-auto bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between px-5 sm:px-8">
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
          <ThemeToggle />
        </header>

        <main className="flex flex-1 flex-col justify-center px-4 py-5 sm:px-8 sm:py-8">
          <div className="paper-edge mx-auto my-auto w-full max-w-[420px] rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:p-7">
            <AuthEntrance>{children}</AuthEntrance>
          </div>
        </main>
      </div>

      <AuthNewspaper />
    </div>
  );
}
