/**
 * Right-half artwork for the split-screen auth pages.
 *
 * PLACEHOLDER: the real hand-drawn `auth-newspaper.svg` component was not in
 * the repo when Phase 4B was implemented. Replace the markup below with the
 * original artwork — the surrounding layout (`<AuthNewspaper />` filling the
 * right half, hidden below `md`) will not need to change.
 */
export function AuthNewspaper() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden h-full min-h-screen overflow-hidden border-l border-border bg-[#F9F8F6] md:block dark:bg-[#0D0D0E]"
    >
      {/* Faint newsprint margin rules */}
      <div className="absolute inset-y-0 left-6 w-px bg-border/70" />
      <div className="absolute inset-y-0 right-6 w-px bg-border/70" />

      <div className="mx-auto flex h-full max-w-md flex-col justify-center px-12 py-16">
        {/* Masthead */}
        <p className="text-center text-[10px] font-medium tracking-[0.3em] text-muted-foreground uppercase">
          Vol. I · The Daily Edition
        </p>
        <h2 className="mt-3 text-center font-heading text-5xl tracking-tight text-foreground">
          The Chronicle
          <span aria-hidden="true" className="text-brand">
            .
          </span>
        </h2>
        <div className="mt-4 border-t-2 border-foreground/80" />
        <div className="mt-1 border-t border-foreground/40" />

        {/* Lead headline */}
        <p className="mt-8 font-heading text-2xl leading-snug tracking-tight text-foreground">
          Everything you follow, distilled into a five-minute read.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Why it matters — your morning briefing, written while you sleep.
        </p>

        {/* Column rules of fake body copy */}
        <div className="mt-8 space-y-2.5">
          {[
            "w-full",
            "w-11/12",
            "w-full",
            "w-9/12",
            "w-full",
            "w-10/12",
            "w-full",
            "w-8/12",
          ].map((width, i) => (
            <div
              key={i}
              className={`h-2 rounded-full bg-foreground/10 ${width}`}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-semibold tracking-[0.25em] text-brand uppercase">
            Why it matters
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-8 space-y-2.5">
          {["w-full", "w-10/12", "w-full", "w-11/12", "w-7/12"].map(
            (width, i) => (
              <div
                key={i}
                className={`h-2 rounded-full bg-foreground/10 ${width}`}
              />
            ),
          )}
        </div>
      </div>
    </aside>
  );
}
