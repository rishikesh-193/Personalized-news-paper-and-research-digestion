"use client";

import * as React from "react";
import { useEffectsPreference } from "./effects-preference";

/**
 * Opt-in smooth scrolling for the landing page only.
 *
 * Lenis is deliberately NOT mounted around the authenticated app: the reading
 * views and chat use nested scroll containers and long-form text where
 * intercepted wheel scrolling hurts usability. The landing page is the one
 * place a cinematic scroll is worth it.
 *
 * It is disabled entirely under reduced motion or the Reduce effects setting,
 * and anchor links keep working because Lenis is initialised with
 * `anchors: true`.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const { reduceEffects, ready } = useEffectsPreference();

  React.useEffect(() => {
    // Wait until the stored preference has been read, otherwise a reader with
    // "Reduce effects" on would get one frame of hijacked scrolling.
    if (!ready || reduceEffects) return;

    let destroyed = false;
    let frame = 0;
    let instance: { raf: (time: number) => void; destroy: () => void } | null =
      null;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    void (async () => {
      const { default: Lenis } = await import("lenis");
      if (destroyed) return;
      instance = new Lenis({
        duration: 1.05,
        // Native touch scrolling is kept — only pointing devices are smoothed.
        syncTouch: false,
        anchors: true,
      }) as unknown as { raf: (time: number) => void; destroy: () => void };

      const loop = (time: number) => {
        if (destroyed) return;
        instance?.raf(time);
        frame = window.requestAnimationFrame(loop);
      };
      frame = window.requestAnimationFrame(loop);
    })();

    const onMotionChange = () => {
      if (motionQuery.matches) {
        window.cancelAnimationFrame(frame);
        instance?.destroy();
        instance = null;
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      destroyed = true;
      motionQuery.removeEventListener("change", onMotionChange);
      window.cancelAnimationFrame(frame);
      instance?.destroy();
      instance = null;
    };
  }, [ready, reduceEffects]);

  return <>{children}</>;
}
