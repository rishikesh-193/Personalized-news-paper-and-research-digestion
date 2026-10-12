"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
        <AlertTriangle className="size-5 text-brand" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-xl tracking-tight">
        This page fell off the press
      </h2>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading it. Your place is saved — try again.
      </p>
      <Button onClick={retry}>
        <RotateCcw aria-hidden="true" />
        Try again
      </Button>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
