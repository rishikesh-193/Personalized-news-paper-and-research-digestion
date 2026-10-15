import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthLayout>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Start your edition
      </p>
      <h1 className="mt-2 font-heading text-2xl tracking-tight text-foreground sm:text-3xl">
        Create your account.
      </h1>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        A personalized newspaper and a research library, ready before your
        first coffee.
      </p>
      <div className="mt-5">
        <SignupForm oauthFailed={params.error === "oauth"} />
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground sm:text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
