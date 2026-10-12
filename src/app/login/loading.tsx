import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-14">
        <div className="w-full max-w-md space-y-4 text-center">
          <Skeleton className="mx-auto h-4 w-44" />
          <Skeleton className="mx-auto h-9 w-full max-w-sm" />
          <Skeleton className="mx-auto h-4 w-3/4" />
          <Skeleton className="mt-8 h-11 w-full" />
        </div>
      </main>
    </div>
  );
}
