"use client";

import dynamic from "next/dynamic";
import { Scene } from "@/components/motion";
import { AuthNewspaperFallback } from "@/components/AuthNewspaperFallback";

/**
 * Right half of the split-screen auth pages.
 *
 * The original hand-drawn SVG was never in the repo — this was a placeholder —
 * so it is now a lazily loaded WebGL newspaper with a gentle page turn, falling
 * back to the static newsprint composition it replaces. Decorative only: the
 * `<aside>` is hidden from assistive technology, and the whole panel is hidden
 * below `md`, where the form takes the full width.
 */
const AuthNewspaperScene = dynamic(
  () =>
    import("@/components/three/auth-newspaper-scene").then(
      (m) => m.AuthNewspaperScene,
    ),
  { ssr: false },
);

export function AuthNewspaper() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden h-full min-h-screen overflow-hidden border-l border-border bg-[#F9F8F6] md:block dark:bg-[#0D0D0E]"
    >
      {/* Faint newsprint margin rules */}
      <div className="pointer-events-none absolute inset-y-0 left-6 w-px bg-border/70" />
      <div className="pointer-events-none absolute inset-y-0 right-6 w-px bg-border/70" />

      <Scene
        className="relative h-full w-full"
        fallback={<AuthNewspaperFallback />}
      >
        <AuthNewspaperScene />
      </Scene>
    </aside>
  );
}
