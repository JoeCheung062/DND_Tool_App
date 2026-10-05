import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  isGifBytes,
  isVideoBytes,
  normalizePlacement,
  placedRect,
  placementFromCornerDrag,
  zoomPlacement,
  type MaterialPlacement,
  type ResizeCorner,
} from "../lib/canvasLayers";
import { decodeGif } from "../lib/gif";

type PreviewMaterial = {
  id: string;
  name: string;
  type: string;
  localUrl: string;
  placement?: Partial<MaterialPlacement>;
  markText?: string;
  markColor?: string;
};

function visualFile(bytes: Uint8Array): { kind: "image" | "video"; mime: string } {
  if (isGifBytes(bytes)) return { kind: "image", mime: "image/gif" };
  if (isVideoBytes(bytes)) {
    const webm = bytes[0] === 0x1a && bytes[1] === 0x45;
    return { kind: "video", mime: webm ? "video/webm" : "video/mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) return { kind: "image", mime: "image/png" };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return { kind: "image", mime: "image/jpeg" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF"
  ) {
    return { kind: "image", mime: "image/webp" };
  }
  return { kind: "image", mime: "image/png" };
}

const CORNERS: ResizeCorner[] = ["nw", "ne", "sw", "se"];

function PlacedMaterial({
  material,
  stage,
  zIndex,
  selected,
  selectOnRelease,
  onSelect,
  onPlacement,
  onOpenMark,
}: {
  material: PreviewMaterial;
  stage: { width: number; height: number };
  zIndex: number;
  selected: boolean;
  selectOnRelease?: boolean;
  onSelect?: (materialId: string | null) => void;
  onPlacement?: (materialId: string, placement: MaterialPlacement) => void;
  onOpenMark?: (materialId: string, x: number, y: number) => void;
}) {
  const placement = normalizePlacement(material.placement);
  const [media, setMedia] = useState<{ url: string; kind: "image" | "video" } | null>(null);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const dragRef = useRef<{
    pointerId: number;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: MaterialPlacement;
    corner?: ResizeCorner;
    anchorX?: number;
    anchorY?: number;
    originDistance?: number;
    originWidth?: number;
    originHeight?: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url = "";
    void (async () => {
      try {
        const response = await fetch(material.localUrl);
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const file = visualFile(bytes);
        url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setMedia({ url, kind: file.kind });
      } catch {
        // The preview can skip a file that is not on this machine yet.
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [material.localUrl]);

  const box = placedRect(natural.width, natural.height, stage.width, stage.height, placement);

  function stagePoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.closest(".zone-preview")?.getBoundingClientRect();
    if (!rect) return null;
    return {
      rect,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.mode !== "move" || !onPlacement) return;
    const point = stagePoint(event);
    if (!point || point.rect.width <= 0 || point.rect.height <= 0) return;
    onPlacement(
      material.id,
      normalizePlacement({
        ...drag.origin,
        x: drag.origin.x + (event.clientX - drag.startX) / point.rect.width,
        y: drag.origin.y + (event.clientY - drag.startY) / point.rect.height,
      })
    );
  }

  function resize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      drag.mode !== "resize" ||
      !drag.corner ||
      drag.anchorX === undefined ||
      drag.anchorY === undefined ||
      !onPlacement
    ) {
      return;
    }
    const point = stagePoint(event);
    if (!point) return;
    onPlacement(
      material.id,
      placementFromCornerDrag({
        stageWidth: point.rect.width,
        stageHeight: point.rect.height,
        anchorX: drag.anchorX,
        anchorY: drag.anchorY,
        pointerX: point.x,
        pointerY: point.y,
        originDistance: drag.originDistance ?? 1,
        originScale: drag.origin.scale,
        originWidth: drag.originWidth ?? box.width,
        originHeight: drag.originHeight ?? box.height,
        corner: drag.corner,
      })
    );
  }

  return (
    <div
      className={["zone-material", selected ? "on" : "", material.placement?.flip ? "flipped" : ""].filter(Boolean).join(" ")}
      data-material-id={material.id}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex,
      }}
      onContextMenu={(event) => {
        if (!onOpenMark) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenMark(material.id, event.clientX, event.clientY);
      }}
      onDoubleClick={(event) => {
        if (!onOpenMark) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenMark(material.id, event.clientX, event.clientY);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest(".zone-handle")) return;
        const moveSelected = !selectOnRelease || selected;
        if (!moveSelected) return;
        onSelect?.(material.id);
        if (!onPlacement) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          mode: "move",
          startX: event.clientX,
          startY: event.clientY,
          origin: placement,
        };
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          dragRef.current = null;
          return;
        }
        const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        dragRef.current = null;
        if (selectOnRelease && drag.mode === "move" && moved <= 6) onSelect?.(null);
      }}
    >
      {material.markText || material.markColor ? (
        <span className="material-mark">
          {material.markColor ? <i style={{ background: material.markColor }} /> : null}
          {material.markText ? <b>{material.markText}</b> : null}
        </span>
      ) : null}
      {media?.kind === "video" ? (
        <video
          src={media.url}
          autoPlay
          muted
          playsInline
          loop
          onLoadedMetadata={(event) =>
            setNatural({
              width: event.currentTarget.videoWidth || 1,
              height: event.currentTarget.videoHeight || 1,
            })
          }
        />
      ) : media ? (
        <img
          src={media.url}
          alt={material.name}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth || 1,
              height: event.currentTarget.naturalHeight || 1,
            })
          }
        />
      ) : null}
      {selected
        ? CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              className={`zone-handle ${corner}`}
              aria-label={`Zoom ${material.name} from the ${corner} corner`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect?.(material.id);
                const point = stagePoint(event);
                if (!point || !onPlacement) return;
                const anchorX = corner === "nw" || corner === "sw" ? box.x + box.width : box.x;
                const anchorY = corner === "nw" || corner === "ne" ? box.y + box.height : box.y;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  pointerId: event.pointerId,
                  mode: "resize",
                  startX: event.clientX,
                  startY: event.clientY,
                  origin: placement,
                  corner,
                  anchorX,
                  anchorY,
                  originDistance: Math.max(1, Math.hypot(point.x - anchorX, point.y - anchorY)),
                  originWidth: box.width,
                  originHeight: box.height,
                };
              }}
              onPointerMove={resize}
              onPointerUp={() => {
                dragRef.current = null;
              }}
            />
          ))
        : null}
    </div>
  );
}

function GifOnce({
  bytes,
  onReady,
  onFinished,
}: {
  bytes: Uint8Array;
  onReady: () => void;
  onFinished: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  const onFinishedRef = useRef(onFinished);
  onReadyRef.current = onReady;
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let timer = 0;
    const animation = decodeGif(bytes);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx || animation.frames.length === 0) {
      onReadyRef.current();
      onFinishedRef.current();
      return;
    }
    canvas.width = animation.width;
    canvas.height = animation.height;
    let index = 0;
    let ready = false;
    const step = () => {
      if (cancelled) return;
      const frame = animation.frames[index];
      if (!frame) return;
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(frame.rgba), animation.width, animation.height),
        0,
        0
      );
      if (!ready) {
        ready = true;
        onReadyRef.current();
      }
      const delay = frame.delayMs;
      index += 1;
      if (index >= animation.frames.length) {
        timer = window.setTimeout(() => {
          if (!cancelled) onFinishedRef.current();
        }, delay);
        return;
      }
      timer = window.setTimeout(step, delay);
    };
    step();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bytes]);

  return <canvas ref={canvasRef} className="zone-playback-gif" aria-hidden="true" />;
}

function PlaybackVisual({
  material,
  stage,
  zIndex,
  onFinished,
  onReady,
}: {
  material: PreviewMaterial;
  stage: { width: number; height: number };
  zIndex: number;
  onFinished: () => void;
  onReady: () => void;
}) {
  const onFinishedRef = useRef(onFinished);
  const onReadyRef = useRef(onReady);
  const [media, setMedia] = useState<{ url: string; kind: "image" | "video" } | null>(null);
  const [gif, setGif] = useState<Uint8Array | null>(null);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const finished = useRef(false);
  const ready = useRef(false);
  onFinishedRef.current = onFinished;
  onReadyRef.current = onReady;

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onFinishedRef.current();
  }

  function markReady() {
    if (ready.current) return;
    ready.current = true;
    onReadyRef.current();
  }

  useEffect(() => {
    let cancelled = false;
    let url = "";
    void (async () => {
      try {
        const response = await fetch(material.localUrl);
        if (!response.ok || cancelled) {
          markReady();
          finish();
          return;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        if (isGifBytes(bytes)) {
          const animation = decodeGif(bytes);
          setNatural({ width: animation.width || 1, height: animation.height || 1 });
          setGif(bytes);
          return;
        }
        const file = visualFile(bytes);
        url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setMedia({ url, kind: file.kind });
      } catch {
        markReady();
        finish();
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [material.localUrl]);

  const box = placedRect(natural.width, natural.height, stage.width, stage.height, { x: 0, y: 0, scale: 1 });
  return (
    <div
      className="zone-material zone-playback"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height, zIndex }}
    >
      {gif ? (
        <GifOnce bytes={gif} onReady={markReady} onFinished={finish} />
      ) : media?.kind === "video" ? (
        <video
          src={media.url}
          autoPlay
          playsInline
          onPlaying={markReady}
          onEnded={finish}
          onError={() => {
            markReady();
            finish();
          }}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setNatural({
              width: video.videoWidth || 1,
              height: video.videoHeight || 1,
            });
          }}
        />
      ) : media ? (
        <img
          src={media.url}
          alt={material.name}
          draggable={false}
          onLoad={(event) => {
            setNatural({
              width: event.currentTarget.naturalWidth || 1,
              height: event.currentTarget.naturalHeight || 1,
            });
            markReady();
            finish();
          }}
          onError={() => {
            markReady();
            finish();
          }}
        />
      ) : null}
    </div>
  );
}

function ZonePlayback({
  materials,
  stage,
  audios,
  onDone,
  onStartAudio,
}: {
  materials: PreviewMaterial[];
  stage: { width: number; height: number };
  audios: HTMLAudioElement[];
  onDone?: () => void;
  onStartAudio?: () => void;
}) {
  const onDoneRef = useRef(onDone);
  const onStartRef = useRef(onStartAudio);
  const visuals = materials.filter((item) => item.type.toUpperCase() !== "SOUND");
  const sounds = materials.filter((item) => item.type.toUpperCase() === "SOUND");
  const pending = useRef(visuals.length + audios.length);
  const settled = useRef(false);
  const audioStarted = useRef(false);
  const visualReady = useRef(0);
  onDoneRef.current = onDone;
  onStartRef.current = onStartAudio;

  function startAudio() {
    if (audioStarted.current) return;
    audioStarted.current = true;
    onStartRef.current?.();
  }

  function finish() {
    if (settled.current) return;
    pending.current -= 1;
    if (pending.current > 0) return;
    settled.current = true;
    onDoneRef.current?.();
  }

  useEffect(() => {
    if (visuals.length === 0) startAudio();
    const backup = window.setTimeout(startAudio, 1200);
    return () => window.clearTimeout(backup);
  }, []);

  useEffect(() => {
    if (visuals.length + audios.length === 0) {
      onDoneRef.current?.();
      return;
    }
    const stops: Array<() => void> = [];
    for (const audio of audios) {
      let settledAudio = false;
      const settle = () => {
        if (settledAudio) return;
        settledAudio = true;
        finish();
      };
      const failed = (audio as HTMLAudioElement & { previewFailed?: boolean }).previewFailed === true;
      if (audio.ended || audio.error || failed) {
        settle();
        continue;
      }
      audio.addEventListener("ended", settle);
      audio.addEventListener("error", settle);
      stops.push(() => {
        audio.removeEventListener("ended", settle);
        audio.removeEventListener("error", settle);
      });
    }
    return () => {
      for (const stop of stops) stop();
    };
  }, []);

  return (
    <>
      {visuals.map((material, index) => (
        <PlaybackVisual
          key={`${material.id}-${index}`}
          onReady={() => {
            visualReady.current += 1;
            if (visualReady.current >= visuals.length) startAudio();
          }}
          material={material}
          stage={stage}
          zIndex={60 + visuals.length - index}
          onFinished={finish}
        />
      ))}
      {sounds.length > 0 ? (
        <p className="zone-sounds">Preview · {sounds.map((item) => item.name).join(" · ")}</p>
      ) : null}
    </>
  );
}

export function ZonePreview({
  materials,
  selectedId,
  onSelect,
  onPlacement,
  selectOnRelease,
  playback,
  playbackToken = 0,
  playbackAudios,
  onPlaybackEnd,
  onStartAudio,
  onOpenMark,
}: {
  materials: PreviewMaterial[];
  selectedId?: string | null;
  onSelect?: (materialId: string | null) => void;
  onPlacement?: (materialId: string, placement: MaterialPlacement) => void;
  onOpenMark?: (materialId: string, x: number, y: number) => void;
  selectOnRelease?: boolean;
  playback?: PreviewMaterial[];
  playbackToken?: number;
  playbackAudios?: HTMLAudioElement[];
  onPlaybackEnd?: () => void;
  onStartAudio?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 1, height: 1 });
  const visuals = materials.filter((item) => item.type.toUpperCase() !== "SOUND");
  const sounds = materials.filter((item) => item.type.toUpperCase() === "SOUND");
  const materialsRef = useRef(materials);
  const onPlacementRef = useRef(onPlacement);
  const selectedIdRef = useRef(selectedId);
  materialsRef.current = materials;
  onPlacementRef.current = onPlacement;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setStage({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      const selected = selectedIdRef.current;
      if (!selected) return;
      const material = materialsRef.current.find((item) => item.id === selected);
      const place = onPlacementRef.current;
      if (!material || !place) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      place(material.id, zoomPlacement(normalizePlacement(material.placement), factor));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div
      className="zone-preview"
      ref={stageRef}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-material-id]")) return;
        onSelect?.(null);
      }}
    >
      {visuals.map((material, index) => (
        <PlacedMaterial
          key={material.id}
          material={material}
          stage={stage}
          zIndex={selectedId === material.id ? visuals.length + 1 : visuals.length - index}
          selected={selectedId === material.id}
          selectOnRelease={selectOnRelease}
          onSelect={onSelect}
          onPlacement={onPlacement}
          onOpenMark={onOpenMark}
        />
      ))}
      {visuals.length === 0 && !(playback && playback.length > 0) ? (
        <p className="zone-empty">Add images or animations to preview this zone</p>
      ) : null}
      {sounds.length > 0 ? (
        <p className="zone-sounds">{sounds.map((item) => item.name).join(" · ")}</p>
      ) : null}
      {playback && playback.length > 0 ? (
        <ZonePlayback
          key={playbackToken}
          materials={playback}
          stage={stage}
          audios={playbackAudios ?? []}
          onDone={onPlaybackEnd}
          onStartAudio={onStartAudio}
        />
      ) : null}
    </div>
  );
}
