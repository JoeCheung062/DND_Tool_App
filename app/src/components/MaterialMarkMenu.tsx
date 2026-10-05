import { useEffect, useRef, useState } from "react";
import type { MeasureMode } from "../lib/mapMeasure";

export const MARK_PALETTE = [
  "#f8fafc",
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#4ade80",
  "#5eead4",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#e879f9",
];

type MarkStep = "root" | "kind" | "text" | "color";

export function MaterialMarkMenu({
  x,
  y,
  texts,
  colors,
  initialStep = "root",
  initialColor,
  showMark = true,
  onText,
  onColor,
  onMeasureMode,
  onClose,
}: {
  x: number;
  y: number;
  texts: string[];
  colors: string[];
  initialStep?: MarkStep;
  initialColor?: string;
  showMark?: boolean;
  onText: (text: string) => void;
  onColor: (color: string) => void;
  onMeasureMode?: (mode: MeasureMode) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<MarkStep>(initialStep);
  const [word, setWord] = useState("");
  const [color, setColor] = useState(initialColor ?? colors[0] ?? MARK_PALETTE[0]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // Defer so the opening click / context menu does not close immediately.
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const extraColors = colors.filter((item) => !MARK_PALETTE.includes(item));
  const left = Math.min(window.innerWidth - 220, Math.max(8, x));
  const top = Math.min(window.innerHeight - 320, Math.max(8, y));

  return (
    <div
      ref={panelRef}
      className="mark-menu"
      style={{ left, top }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {step === "root" ? (
        <>
          {showMark ? (
            <button type="button" role="menuitem" onClick={() => setStep("kind")}>
              Mark
            </button>
          ) : null}
          {onMeasureMode
            ? (
                [
                  ["square", "Square"],
                  ["circle", "Circle"],
                  ["line", "Line"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onMeasureMode(mode);
                    onClose();
                  }}
                >
                  {label}
                </button>
              ))
            : null}
        </>
      ) : null}
      {step === "kind" ? (
        <>
          <button type="button" role="menuitem" onClick={() => setStep("text")}>
            Text
          </button>
          <button type="button" role="menuitem" onClick={() => setStep("color")}>
            Color
          </button>
        </>
      ) : null}
      {step === "text" ? (
        <form
          className="mark-menu-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = word.trim();
            if (!next) return;
            onText(next);
          }}
        >
          <div className="mark-menu-head">
            <span>Text</span>
            <button type="button" className="mark-menu-close" aria-label="Cancel" onClick={onClose}>
              ×
            </button>
          </div>
          <label>
            <span className="sr-only">Text</span>
            <input value={word} autoFocus maxLength={24} onChange={(event) => setWord(event.target.value)} />
          </label>
          {texts.length > 0 ? (
            <div className="mark-defaults">
              {texts.map((item) => (
                <button key={item} type="button" onClick={() => setWord(item)}>
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <button className="btn tiny" type="submit" disabled={!word.trim()}>
            Confirm
          </button>
        </form>
      ) : null}
      {step === "color" ? (
        <form
          className="mark-menu-form"
          onSubmit={(event) => {
            event.preventDefault();
            onColor(color);
          }}
        >
          <div className="mark-menu-head">
            <span>Color</span>
            <button type="button" className="mark-menu-close" aria-label="Cancel" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="mark-palette">
            {[...MARK_PALETTE, ...extraColors].map((item) => (
              <button
                key={item}
                type="button"
                className={item === color ? "on" : ""}
                style={{ background: item }}
                aria-label={item}
                onClick={() => setColor(item)}
              />
            ))}
          </div>
          <button className="btn tiny" type="submit">
            Confirm
          </button>
        </form>
      ) : null}
    </div>
  );
}
