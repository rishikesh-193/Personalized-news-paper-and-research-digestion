import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
        Recover your account
      </p>
      <h1 className="mt-4 font-heading text-3xl tracking-tight sm:text-4xl">
        Forgot your password?
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
