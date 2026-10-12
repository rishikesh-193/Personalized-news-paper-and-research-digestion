import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-10 sm:px-6 sm:py-14">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-full max-w-lg" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-24" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-5 h-9 w-full sm:w-64" />
        </div>
        <Skeleton className="h-11 w-40" />
      </main>
    </div>
  );
}
