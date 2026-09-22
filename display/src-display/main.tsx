import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  containRect,
  layoutCanvasLayers,
  type CanvasLayer,
  type CanvasMaterial,
} from "../src/lib/canvasLayers";
import "./display.css";

type DisplayViewApi = {
  getScreenId: () => number | null;
  onShow: (
    cb: (payload: {
      requestId: string;
      screenId: number;
      materialId?: string;
      combinationId?: string;
      materials?: CanvasMaterial[];
      content?: unknown;
      replyChannel: string;
    }) => void
  ) => () => void;
  onPaint: (cb: (payload: { requestId: string }) => void) => () => void;
  ackApplied: (payload: {
    replyChannel: string;
    ok: boolean;
    error?: string;
    screenId: number;
  }) => void;
};

declare global {
  interface Window {
    displayViewApi?: DisplayViewApi;
  }
}

function drawLayers(
  canvas: HTMLCanvasElement,
  bitmaps: Array<{ layer: CanvasLayer; bitmap: ImageBitmap }>
) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const { layer, bitmap } of bitmaps) {
    const box = containRect(bitmap.width, bitmap.height, canvas.width, canvas.height);
    ctx.globalAlpha = layer.alpha;
    ctx.drawImage(bitmap, box.x, box.y, box.width, box.height);
  }
  ctx.globalAlpha = 1;
}

function DisplayScreen() {
  const screenId = useMemo(() => {
    const fromApi = window.displayViewApi?.getScreenId();
    if (typeof fromApi === "number") return fromApi;
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get("screenId"));
    return Number.isFinite(n) ? n : 0;
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingRef = useRef<{ requestId: string; materials: CanvasMaterial[] } | null>(
    null
  );
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [paintedRequest, setPaintedRequest] = useState<string | null>(null);
  const [message, setMessage] = useState("Standing by");
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const api = window.displayViewApi;
    if (!api) {
      setMessage("Display view API missing (open via Electron)");
      return;
    }

    const offShow = api.onShow((payload) => {
      const materials = payload.materials ?? [];
      pendingRef.current = { requestId: payload.requestId, materials };
      setAuthed(false);
      setPaintedRequest(null);
      setError(null);
      if (materials.length > 0) {
        setMessage(materials.map((item) => item.name).join(" + "));
      } else if (payload.combinationId) {
        setMessage(`Combination ${payload.combinationId}`);
      } else if (payload.materialId) {
        setMessage("Material is not on this device");
      } else {
        setMessage("Empty assignment");
      }
      api.ackApplied({
        replyChannel: payload.replyChannel,
        ok: true,
        screenId: payload.screenId,
      });
    });

    const offPaint = api.onPaint((payload) => {
      const pending = pendingRef.current;
      if (!pending || pending.requestId !== payload.requestId) return;
      setLayers(layoutCanvasLayers(pending.materials));
      setPaintedRequest(payload.requestId);
      setAuthed(true);
    });

    return () => {
      offShow();
      offPaint();
    };
  }, []);

  useEffect(() => {
    if (!paintedRequest) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    const visuals = layers.filter((layer) => layer.kind !== "sound");

    void (async () => {
      try {
        const bitmaps: Array<{ layer: CanvasLayer; bitmap: ImageBitmap }> = [];
        for (const layer of visuals) {
          const response = await fetch(layer.localUrl);
          if (!response.ok) {
            throw new Error(`Could not read ${layer.name}`);
          }
          const bitmap = await createImageBitmap(await response.blob());
          bitmaps.push({ layer, bitmap });
        }
        if (cancelled || !canvas) return;
        drawLayers(canvas, bitmaps);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Canvas paint failed");
      }
    })();

    for (const audio of audiosRef.current) {
      audio.pause();
    }
    audiosRef.current = layers
      .filter((layer) => layer.kind === "sound")
      .map((layer) => {
        const audio = new Audio(layer.localUrl);
        audio.loop = true;
        void audio.play().catch(() => {
          // Autoplay can fail until the window is focused; the element stays mounted.
        });
        return audio;
      });

    return () => {
      cancelled = true;
    };
  }, [layers, paintedRequest]);

  const sounds = layers.filter((layer) => layer.kind === "sound");
  const showIdle = !authed || layers.every((layer) => layer.kind === "sound");

  return (
    <div className="display-root">
      <canvas ref={canvasRef} className="display-canvas" />
      <div className="display-chrome">
        <span>Screen {screenId}</span>
        <span>{authed ? "Authenticated" : "Awaiting authentication"}</span>
        <span>{message}</span>
      </div>
      {error ? <div className="display-error">{error}</div> : null}
      {showIdle && !error ? (
        <div className="display-idle">
          {authed && sounds.length > 0 ? "Audio playing" : "Awaiting content"}
        </div>
      ) : null}
      {authed && sounds.length > 0 ? (
        <div className="display-audio-rack">
          {sounds.map((layer) => (
            <span key={layer.id}>{layer.name}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DisplayScreen />
  </StrictMode>
);
