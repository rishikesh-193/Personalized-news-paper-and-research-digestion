"use client";

import * as React from "react";
import { cn } from "cn";
import { useEffectsPreference } from "./effects-preference";
import { useIsNarrowViewport } from "./use-media-query";

/** Never-changing subscription for capability snapshots. */
const noopSubscribe = () => () => {};

/** Maximum device pixel ratio any Chronicle scene may render at. */
const MAX_DPR = 1.5;

export type SceneState = {
  /** True while the tab is hidden or the scene is scrolled out of view. */
  paused: boolean;
  /** Phones and other narrow viewports get simplified geometry. */
  lowPower: boolean;
  /** Capped device pixel ratio to pass to the Canvas. */
  dpr: number;
};

const SceneStateContext = React.createContext<SceneState>({
  paused: false,
  lowPower: false,
  dpr: 1,
});

/** Render-cost configuration for the scene inside the nearest <Scene>. */
export function useSceneState(): SceneState {
  return React.useContext(SceneStateContext);
}

/** One-shot WebGL capability probe; cached for the session. */
let webglSupport: boolean | null = null;

function detectWebgl(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    webglSupport = Boolean(context);
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

class SceneErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // A broken scene must never take the page down. Log it once and show the
    // static composition instead.
    console.error("Chronicle: 3D scene failed, using static fallback.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type SceneProps = {
  children: React.ReactNode;
  /** Static composition shown before mount, without WebGL, and on failure. */
  fallback: React.ReactNode;
  className?: string;
  /** Accessible name; the canvas itself is decorative. */
  label?: string;
};

/**
 * The single WebGL boundary for a page.
 *
 * Responsibilities:
 * - renders `fallback` on the server, on the first client render, without
 *   WebGL, under reduced motion, and when the Reduce effects preference is on
 *   (so hydration output is identical on both sides);
 * - mounts the scene only once it is near the viewport;
 * - pauses rendering while the tab is hidden or the scene is off-screen;
 * - caps the pixel ratio and reports narrow viewports so the scene can
 *   degrade itself.
 */
export function Scene({ children, fallback, className, label }: SceneProps) {
  const { reduceEffects, ready } = useEffectsPreference();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  // Capability and viewport facts are external stores: the server snapshot is
  // the conservative default, so the first client render matches the server
  // HTML and the measured values arrive as a normal update afterwards.
  const supported = React.useSyncExternalStore(
    noopSubscribe,
    detectWebgl,
    () => false,
  );
  const lowPower = useIsNarrowViewport();
  const dpr = React.useSyncExternalStore(
    noopSubscribe,
    () => Math.min(window.devicePixelRatio || 1, MAX_DPR),
    () => 1,
  );

  // Only build the scene when it is close to the viewport.
  React.useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Pause while the document is hidden.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const state = React.useMemo<SceneState>(
    () => ({ paused: hidden || !inView, lowPower, dpr }),
    [hidden, inView, lowPower, dpr],
  );

  const renderScene = ready && !reduceEffects && supported && inView;

  return (
    <div
      ref={hostRef}
      className={cn("relative", className)}
      // The scene is decorative; its accessible description lives in the text.
      role={label ? "group" : undefined}
      aria-label={label}
      data-scene={renderScene ? "live" : "fallback"}
    >
      {renderScene ? (
        <SceneErrorBoundary fallback={fallback}>
          <SceneStateContext.Provider value={state}>
            <React.Suspense fallback={fallback}>{children}</React.Suspense>
          </SceneStateContext.Provider>
        </SceneErrorBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
