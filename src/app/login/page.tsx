import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { AuthLayout } from "@/components/auth-layout";

export const metadata: Metadata = { title: "Login" };

function safeNext(next: string | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthLayout>
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
          resetSuccess={params.reset === "success"}
        />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
