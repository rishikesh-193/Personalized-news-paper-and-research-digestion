import type { Metadata } from "next";
import { OnboardingView } from "@/components/views/onboarding-view";

export const metadata: Metadata = { title: "Onboarding" };

function safeNext(next: string | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <OnboardingView next={safeNext(params.next)} />;
}
