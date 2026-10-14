"use client";

import { Reveal } from "@/components/motion";

/**
 * Staggers the auth column in on load: eyebrow, heading, subcopy, then form.
 *
 * The wrapper is a client component so the server-rendered page can keep
 * passing its own children through unchanged. Under reduced motion each child
 * renders in its final state.
 */
export function AuthEntrance({ children }: { children: React.ReactNode }) {
  return (
    <Reveal stagger={0.07} distance={12}>
      {children}
    </Reveal>
  );
}
