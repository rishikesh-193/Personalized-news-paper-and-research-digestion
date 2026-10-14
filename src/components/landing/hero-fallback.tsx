import { cn } from "cn";

/**
 * The static counterpart of the 3D hero.
 *
 * Shown while the WebGL chunk loads, on devices without WebGL, and whenever
 * reduced motion or the Reduce effects setting is on — so the hero is never an
 * empty box. Purely decorative and drawn with CSS.
 */
export function HeroFallback({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex items-center justify-center", className)}
    >
      <div className="relative h-full w-full [perspective:1200px]">
        {/* Back sheets */}
        <div className="paper-edge absolute top-[14%] left-[16%] h-[74%] w-[62%] rounded-[3px] bg-[#E4D8C9] [transform:rotate(-5deg)] dark:bg-[#1b1b1e]" />
        <div className="paper-edge absolute top-[10%] left-[13%] h-[76%] w-[64%] rounded-[3px] bg-[#EADFD2] [transform:rotate(3deg)] dark:bg-[#202024]" />

        {/* Front page */}
        <div className="paper-edge absolute top-[7%] left-[10%] h-[80%] w-[68%] overflow-hidden rounded-[3px] bg-[#F7F3EC] px-[7%] py-[6%] [transform:rotate(-1.5deg)] dark:bg-[#efe9df]">
          <p className="font-heading text-[clamp(0.9rem,2.4vw,1.6rem)] leading-none tracking-tight text-[#17161A]">
            The Chronicle
            <span className="text-[#B33A1E]">.</span>
          </p>
          <p className="mt-1 text-[6px] font-medium tracking-[0.2em] text-[#8b8578] uppercase sm:text-[8px]">
            Vol. I · The Daily Edition
          </p>
          <div className="mt-2 h-[2px] w-full bg-[#17161A]" />
          <div className="mt-[2px] h-px w-full bg-[#c9c2b6]" />

          <p className="mt-[5%] font-heading text-[clamp(0.7rem,1.9vw,1.15rem)] leading-[1.15] tracking-tight text-[#17161A]">
            The internet, edited down to a five-minute read.
          </p>
          <p className="mt-[3%] text-[6px] font-medium tracking-[0.18em] text-[#B33A1E] uppercase sm:text-[8px]">
            Your morning briefing
          </p>

          <div className="mt-[5%] grid grid-cols-2 gap-[6%]">
            {[0, 1].map((column) => (
              <div key={column} className="space-y-[5px]">
                {Array.from({ length: 11 }).map((_, line) => (
                  <div
                    key={line}
                    className="h-[3px] rounded-full bg-[#17161A]/15"
                    style={{ width: line === 10 ? "58%" : "100%" }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-[6%] border-t border-[#c9c2b6] pt-[3%]">
            <p className="text-[6px] font-semibold tracking-[0.2em] text-[#B33A1E] uppercase sm:text-[8px]">
              Why it matters
            </p>
            <div className="mt-[3%] space-y-[5px]">
              {Array.from({ length: 3 }).map((_, line) => (
                <div
                  key={line}
                  className="h-[3px] rounded-full bg-[#17161A]/15"
                  style={{ width: line === 2 ? "62%" : "100%" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
