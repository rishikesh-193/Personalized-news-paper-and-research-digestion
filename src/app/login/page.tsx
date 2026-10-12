import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Login" };

function safeNext(next: string | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
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
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-14">
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
            Your edition is waiting
          </p>
          <h1 className="mt-4 font-heading text-3xl tracking-tight sm:text-4xl">
            Pick up where the internet left off.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Sign in to get your personalized newspaper, research digests and a
            library you can ask questions of.
          </p>
          <div className="mt-8">
            <LoginForm
              next={safeNext(params.next)}
              oauthFailed={params.error === "oauth"}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <p className="mx-auto max-w-5xl px-5 py-5 text-center text-xs text-muted-foreground sm:px-8">
          No passwords here — Chronicle uses Supabase Auth with Google.
        </p>
      </footer>
    </div>
  );
}
