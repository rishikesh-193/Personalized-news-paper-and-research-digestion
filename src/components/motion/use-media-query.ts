"use client";

import * as React from "react";

/**
 * Hydration-safe media query subscription.
 *
 * The server snapshot is always `false`, so the first client render matches the
 * server HTML and the real value arrives after mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True below Tailwind's `md` breakpoint (768px). */
export function useIsNarrowViewport(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
