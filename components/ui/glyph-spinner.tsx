import "./glyph-spinner.css";

import type { CSSProperties } from "react";
import spinners from "unicode-animations";

import { cn } from "@/lib/utils";

const braille = {
  frames: spinners.braille.frames.map((frame) => [...frame][0] ?? "⠀"),
  interval: spinners.braille.interval,
};

export function GlyphSpinner({
  ariaLabel = "Loading",
  className,
}: {
  ariaLabel?: string;
  className?: string;
}) {
  const vars = {
    "--glyph-spinner-duration": `${braille.frames.length * braille.interval}ms`,
    "--glyph-spinner-frames": braille.frames.length,
  } as CSSProperties;

  return (
    <span
      aria-label={ariaLabel}
      className={cn("inline-flex items-center justify-center font-mono leading-none", className)}
      role="status"
    >
      <span aria-hidden="true" className="glyph-spinner">
        <span className="glyph-spinner__strip" style={vars}>
          {braille.frames.map((frame, index) => (
            <span className="glyph-spinner__frame" key={`${index}:${frame}`}>
              {frame}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
