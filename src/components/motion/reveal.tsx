"use client";

import * as React from "react";
import { motion } from "motion/react";
import { useEffectsPreference } from "./effects-preference";

type RevealTag =
  | "div"
  | "section"
  | "article"
  | "li"
  | "ol"
  | "ul"
  | "header"
  | "footer"
  | "p"
  | "aside";

// The drag and animation handlers are omitted because motion redefines them
// with incompatible signatures; everything else forwards unchanged.
type RevealProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  | "children"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragLeave"
  | "onDragOver"
  | "onDrop"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
> & {
  children: React.ReactNode;
  /** Seconds of delay before this block animates in. */
  delay?: number;
  /** Travel distance in pixels; 0 gives a pure fade. */
  distance?: number;
  /** Stagger direct children instead of animating the wrapper as a whole. */
  stagger?: number;
  as?: RevealTag;
};

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Reveals content once, when it first enters the viewport.
 *
 * `whileInView` with `once: true` is used rather than a permanent animation so
 * nothing keeps animating off-screen. Under reduced effects the children render
 * in their final state with no transition at all.
 *
 * Attribute props are forwarded, so a revealed element keeps its `role`,
 * `aria-label` and other semantics.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  distance = 18,
  stagger,
  as = "div",
  ...rest
}: RevealProps) {
  const { reduceEffects } = useEffectsPreference();

  if (reduceEffects) {
    return React.createElement(as, { ...rest, className }, children);
  }

  const MotionTag = motion[as];

  if (stagger !== undefined && stagger > 0) {
    return (
      <MotionTag
        {...rest}
        className={className}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
        }}
      >
        {React.Children.toArray(children).map((child, index) => (
          // A real wrapper element, not `display: contents` — an element with
          // no box cannot animate opacity or transform, which would silently
          // turn the stagger into nothing.
          <motion.div
            key={index}
            variants={{
              hidden: { opacity: 0, y: distance },
              visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
            }}
          >
            {child}
          </motion.div>
        ))}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      {...rest}
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}
