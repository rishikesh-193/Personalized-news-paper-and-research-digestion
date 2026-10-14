"use client";

import * as React from "react";
import { cn } from "cn";
import { useEffectsPreference } from "./effects-preference";

type TiltCardProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  children: React.ReactNode;
  /** Maximum rotation in degrees at the card's edge. */
  max?: number;
  /** Adds a soft glare that follows the pointer. */
  glare?: boolean;
  as?: "div" | "article" | "li" | "section" | "button";
  type?: "button" | "submit" | "reset";
};

export type { TiltCardProps };

/**
 * Subtle pointer-driven 3D tilt with an optional glare.
 *
 * The pointer position is written straight to CSS custom properties inside a
 * rAF callback — no React state, so there are no per-frame re-renders and the
 * animation stays on the compositor. Touch input, reduced motion, and the
 * Reduce effects setting all skip the listeners entirely, and the listeners
 * are only attached while the pointer is over the card.
 */
export function TiltCard({
  children,
  className,
  max = 5,
  glare = true,
  as = "div",
  type,
  ...rest
}: TiltCardProps) {
  const { reduceEffects } = useEffectsPreference();
  const ref = React.useRef<HTMLElement | null>(null);
  const frame = React.useRef<number | null>(null);

  const enabled = !reduceEffects;

  React.useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    // Coarse pointers cannot hover; skip the work entirely rather than pay for
    // listeners that never fire.
    if (window.matchMedia("(hover: none)").matches) return;

    let active = false;

    const apply = (clientX: number, clientY: number) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      // Clamp so a pointer that leaves the card mid-frame cannot over-rotate.
      const cx = Math.min(1, Math.max(0, px));
      const cy = Math.min(1, Math.max(0, py));
      node.style.setProperty("--tilt-rotate-y", `${(cx - 0.5) * 2 * max}deg`);
      node.style.setProperty("--tilt-rotate-x", `${(0.5 - cy) * 2 * max}deg`);
      node.style.setProperty("--tilt-glare-x", `${cx * 100}%`);
      node.style.setProperty("--tilt-glare-y", `${cy * 100}%`);
    };

    const schedule = (clientX: number, clientY: number) => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        apply(clientX, clientY);
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!active) {
        active = true;
        node.dataset.tilting = "true";
      }
      schedule(event.clientX, event.clientY);
    };

    const onPointerLeave = () => {
      active = false;
      delete node.dataset.tilting;
    };

    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerleave", onPointerLeave);
    node.addEventListener("pointercancel", onPointerLeave);

    return () => {
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("pointercancel", onPointerLeave);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      delete node.dataset.tilting;
    };
  }, [enabled, max]);

  // createElement keeps the tag polymorphic without fighting the JSX prop
  // types of a union of intrinsic elements.
  return React.createElement(
    as,
    {
      ...rest,
      ref,
      type,
      className: cn("tilt-card", className),
      "data-glare": glare ? "true" : undefined,
    },
    children,
  );
}
