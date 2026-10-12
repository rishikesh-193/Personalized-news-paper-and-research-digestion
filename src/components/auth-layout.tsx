import type * as React from "react";
import Link from "next/link";
import { AuthNewspaper } from "@/components/AuthNewspaper";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Split-screen auth shell used by /login, /signup, /forgot-password and
 * /reset-password: centered form column on the left (max width ~400px),
 * full-height artwork on the right, hidden below the md breakpoint.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col bg-background">
        <header className="flex h-14 items-center justify-between px-5 sm:px-8">
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

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>

      <AuthNewspaper />
    </div>
  );
}
