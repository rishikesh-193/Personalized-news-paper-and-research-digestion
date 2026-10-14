"use client";

import * as React from "react";

/**
 * The persistent "Reduce effects" preference.
 *
 * Stored in localStorage rather than Supabase: it is a per-device display
 * preference, and a reader may want the cinematic treatment on a desktop and
 * the calm version on a phone.
 *
 * The stored value is an external store (not state filled in from an effect),
 * so the server render and the first client render both report `false` and the
 * real value arrives as a normal post-hydration update — no mismatch, no
 * cascading render.
 */
const STORAGE_KEY = "chronicle:reduce-effects";
const STORE_EVENT = "chronicle:reduce-effects";

const noopSubscribe = () => () => {};

/** Server/hydration snapshot: no storage access, so report the default. */
function getServerPreferenceSnapshot() {
  return false;
}

function getPreferenceSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private mode or storage disabled: keep the default.
    return false;
  }
}

function subscribeToPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORE_EVENT, onChange);
  };
}

/** False until React has hydrated on the client. */
function useHydrated() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function subscribeToMotionQuery(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getMotionQuerySnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMotionQueryServerSnapshot() {
  return false;
}

/** The OS `prefers-reduced-motion` setting. */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToMotionQuery,
    getMotionQuerySnapshot,
    getMotionQueryServerSnapshot,
  );
}

type EffectsContextValue = {
  /** True when effects should be suppressed (stored preference OR the OS). */
  reduceEffects: boolean;
  /** Only the stored preference, ignoring the OS setting. */
  preference: boolean;
  setPreference: (value: boolean) => void;
  /** False until the stored preference has been read on the client. */
  ready: boolean;
};

const EffectsContext = React.createContext<EffectsContextValue>({
  reduceEffects: false,
  preference: false,
  setPreference: () => {},
  ready: false,
});

export function EffectsProvider({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const preference = React.useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );
  const ready = useHydrated();

  const setPreference = React.useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      // The in-memory write below still applies for this session.
    }
    // Same-tab listeners do not receive the browser's `storage` event, so the
    // store change is announced explicitly.
    window.dispatchEvent(new Event(STORE_EVENT));
  }, []);

  const value = React.useMemo<EffectsContextValue>(
    () => ({
      reduceEffects: preference || prefersReducedMotion,
      preference,
      setPreference,
      ready,
    }),
    [preference, prefersReducedMotion, setPreference, ready],
  );

  return (
    <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>
  );
}

/** Motion policy for components that animate. */
export function useEffectsPreference(): EffectsContextValue {
  return React.useContext(EffectsContext);
}
