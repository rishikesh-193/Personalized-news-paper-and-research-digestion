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
      <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
        Start your edition
      </p>
      <h1 className="mt-4 font-heading text-3xl tracking-tight sm:text-4xl">
        Create your account.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        A personalized newspaper and a research library, ready before your
        first coffee.
      </p>
      <div className="mt-8">
        <SignupForm oauthFailed={params.error === "oauth"} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
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
