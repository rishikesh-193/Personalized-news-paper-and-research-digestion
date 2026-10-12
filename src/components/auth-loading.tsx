import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton shared by the auth pages' loading.tsx files. */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="w-full space-y-5">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-44" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mx-auto h-4 w-40" />
      </div>
    </div>
  );
}
