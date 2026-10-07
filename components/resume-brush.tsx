"use client";

import { HighlighterIcon, PenLineIcon } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import type { PageBox } from "@/hooks/use-pdf-pages";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import type { TooltipGroupHandle } from "@/components/ui/tooltip";
import { type Art, type ArtStroke, strokeAlpha, strokePath } from "@/lib/resume/art";
import { useHistoryStore } from "@/lib/store/history";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

/**
 * Drawing on the page by hand: a pen that swells and tapers with pressure,
 * and a highlighter. Each stroke lands as art on the page — the same kind the
 * agent makes — so it prints, steps through the history, and can be moved or
 * redrawn by asking. P picks up the pen, H the highlighter, Escape puts it down.
 */

type Tool = "pen" | "marker";

type BrushState = { tool: Tool | null; setTool: (tool: Tool | null) => void };

export const useBrushStore = create<BrushState>()((set) => ({
  tool: null,
  setTool: (tool) => set({ tool }),
}));

/** A pen's nib and a highlighter's, in points. */
const NIB: Record<Tool, number> = { pen: 2.4, marker: 12 };

/** A highlighter is yellow unless asked otherwise; a pen writes in the resume's own ink. */
const MARKER = "#ffe14d";

/** Room around a stroke's box for the nib, so its edges aren't clipped. */
const PAD = 2;

/** Points closer than this, on screen, are one point. */
const MIN_STEP_PX = 1.5;

type Live = { page: number; points: number[][]; tool: Tool };

const round = (n: number) => Math.round(n * 10) / 10;

/** A stroke drawn on a page, as a piece of art boxed tightly around it. */
function pieceOf(live: Live, color: string, n: number): Art {
  const nib = NIB[live.tool];
  const xs = live.points.map((point) => point[0]!);
  const ys = live.points.map((point) => point[1]!);
  const left = Math.min(...xs) - nib / 2 - PAD;
  const top = Math.min(...ys) - nib / 2 - PAD;
  const width = Math.max(...xs) - left + nib / 2 + PAD;
  const height = Math.max(...ys) - top + nib / 2 + PAD;
  const stroke: ArtStroke = {
    points: live.points.map(([x, y, pressure]) =>
      pressure === undefined
        ? [round(x! - left), round(y! - top)]
        : [round(x! - left), round(y! - top), round(pressure)],
    ),
    size: nib,
    color,
    ...(live.tool === "marker" ? { marker: true } : {}),
  };
  return {
    id: `${live.tool === "marker" ? "highlight" : "ink"}-${n}-${Date.now().toString(36)}`,
    label: live.tool === "marker" ? "highlighter mark" : "pen line",
    page: live.page + 1,
    x: round(left),
    y: round(top),
    width: round(width),
    height: round(height),
    strokes: [stroke],
    // A highlighter goes under the words it marks, as it would on paper.
    layer: live.tool === "marker" ? "behind" : "front",
  };
}

export function ResumeBrush({ pages }: { pages: PageBox[] }) {
  const tool = useBrushStore((s) => s.tool);
  const ink = useResumeStore((s) => s.doc.theme.text || "#111111");
  const [live, setLive] = useState<Live | null>(null);
  const drawing = useRef<Live | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useBrushKeys();

  const color = tool === "marker" ? MARKER : ink;

  const at = (event: PointerEvent) => {
    const rect = host.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const index = pages.findIndex((page) => y >= page.start && y <= page.end);
    return { index, x, y };
  };

  const pointOf = (event: PointerEvent, page: PageBox, x: number, y: number) => {
    const point = [x / page.scale, (y - page.top) / page.scale];
    // A mouse reports a flat 0.5; only a pen's pressure is worth keeping.
    return event.pointerType === "pen" && event.pressure > 0 ? [...point, event.pressure] : point;
  };

  const onDown = (event: PointerEvent) => {
    if (!tool || event.button !== 0) return;
    const { index, x, y } = at(event);
    const page = pages[index];
    if (!page) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = { page: index, points: [pointOf(event, page, x, y)], tool };
    setLive(drawing.current);
  };

  const onMove = (event: PointerEvent) => {
    const now = drawing.current;
    const page = now && pages[now.page];
    if (!now || !page) return;
    const { x, y } = at(event);
    const last = now.points.at(-1)!;
    if (
      Math.hypot(x / page.scale - last[0]!, (y - page.top) / page.scale - last[1]!) * page.scale <
      MIN_STEP_PX
    )
      return;
    // A highlighter is drawn straight, held level as a ruler would hold it.
    const point = pointOf(event, page, x, y);
    if (now.tool === "marker" && event.shiftKey) point[1] = now.points[0]![1]!;
    drawing.current = { ...now, points: [...now.points, point] };
    setLive(drawing.current);
  };

  const onUp = () => {
    const done = drawing.current;
    drawing.current = null;
    setLive(null);
    if (!done || !tool) return;
    // A tap is a dot: worth keeping with a pen, not with a highlighter.
    if (done.points.length < 2 && done.tool === "marker") return;
    const points =
      done.points.length < 2
        ? [...done.points, done.points[0]!.map((n, i) => (i < 2 ? n + 0.3 : n))]
        : done.points;
    const store = useResumeStore.getState();
    const piece = pieceOf({ ...done, points }, color, (store.doc.art ?? []).length + 1);
    const history = useHistoryStore.getState();
    history.begin();
    store.patchDoc({ art: [...(store.doc.art ?? []), piece] });
    history.record(done.tool === "marker" ? "Highlighted" : "Drew a line");
    useMarksStore.getState().clearMarks();
  };

  const page = live ? pages[live.page] : undefined;
  const preview =
    live && page
      ? strokePath(
          {
            points: live.points,
            size: NIB[live.tool],
            color,
            ...(live.tool === "marker" ? { marker: true } : {}),
          },
          page.scale,
          0,
          page.top,
        )
      : "";

  return tool ? (
    <div
      ref={host}
      className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {preview ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <path
            d={preview}
            fill={color}
            fillOpacity={
              live?.tool === "marker"
                ? strokeAlpha({ points: [], size: 1, color, marker: true })
                : 1
            }
            style={live?.tool === "marker" ? { mixBlendMode: "multiply" } : undefined}
          />
        </svg>
      ) : null}
    </div>
  ) : null;
}

/**
 * P and H pick up a tool, or put it down if it is already in hand; Escape puts
 * it down. Never from a field: a letter is a character first, and taking it
 * from an empty one ate the first letter of every message that began with it
 * ("punch this up" went in as "unch this up"). The toolbar has the tools for
 * when the chat's box has focus.
 */
function useBrushKeys() {
  useEffect(() => {
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

    const onKey = (event: globalThis.KeyboardEvent) => {
      const store = useBrushStore.getState();
      if (event.key === "Escape" && store.tool) {
        store.setTool(null);
        return;
      }
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        editable(event.target)
      )
        return;
      const key = event.key.toLowerCase();
      const tool: Tool | null = key === "p" ? "pen" : key === "h" ? "marker" : null;
      if (!tool) return;
      event.preventDefault();
      store.setTool(store.tool === tool ? null : tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * The two drawing tools, for the page's toolbar (components/resume-history.tsx):
 * the held one inks in, as a tool in Figma's toolbar does.
 */
export function BrushTools({ group }: { group?: TooltipGroupHandle }) {
  const tool = useBrushStore((s) => s.tool);
  const setTool = useBrushStore((s) => s.setTool);
  const held = "bg-foreground text-background hover:bg-foreground/90 hover:text-background";

  return (
    <div role="toolbar" aria-label="Draw on the page" className="flex items-center gap-0.5">
      <TooltipIconButton
        tooltip="Pen · P"
        group={group}
        aria-pressed={tool === "pen"}
        onClick={() => setTool(tool === "pen" ? null : "pen")}
        className={cn("size-7 rounded-full", tool === "pen" && held)}
      >
        <PenLineIcon className="size-3.5" />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Highlighter · H · ⇧ for straight"
        group={group}
        aria-pressed={tool === "marker"}
        onClick={() => setTool(tool === "marker" ? null : "marker")}
        className={cn("size-7 rounded-full", tool === "marker" && held)}
      >
        <HighlighterIcon className="size-3.5" />
      </TooltipIconButton>
    </div>
  );
}
