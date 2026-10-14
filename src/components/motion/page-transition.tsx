"use client";

import * as React from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffectsPreference } from "./effects-preference";

/**
 * A restrained cross-route fade for the authenticated app.
 *
 * Deliberately opacity-only: a `transform` here would create a containing block
 * for any `position: fixed` descendant, and a full enter/exit pair would
 * remount the page subtree, which fights App Router's scroll restoration. It
 * keys on `pathname` (not search params) so re-filtering a list on the same
 * route does not remount anything.
 *
 * The Next.js App Router re-renders this layout on navigation, so the fade
 * replays on route change without touching history or scroll behaviour.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const { reduceEffects } = useEffectsPreference();

  if (reduceEffects) return <div className={className}>{children}</div>;

  return (
    <motion.div
      key={pathname}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
