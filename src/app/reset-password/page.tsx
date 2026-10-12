import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth-layout";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
        Set a new password
      </p>
      <h1 className="mt-4 font-heading text-3xl tracking-tight sm:text-4xl">
        Make it yours again.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Choose a password of at least 8 characters.
      </p>
      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </AuthLayout>
  );
}
