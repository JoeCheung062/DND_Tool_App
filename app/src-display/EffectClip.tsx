import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isGifBytes,
  isVideoBytes,
  isVideoClip,
  placedRect,
  type CanvasLayer,
  type MaterialPlacement,
} from "../src/lib/canvasLayers";
import { decodeGif } from "../src/lib/gif";

type DecodedFrame = CanvasImageSource & {
  displayWidth: number;
  displayHeight: number;
  duration?: number | null;
  close: () => void;
};

type ImageDecoderLike = {
  tracks: {
    ready: Promise<void>;
    selectedTrack: { frameCount: number } | null;
  };
  decode: (options: { frameIndex: number }) => Promise<{ image: DecodedFrame }>;
  close: () => void;
};

function mimeFromUrl(url: string) {
  if (/\.gif(\?|#|$)/i.test(url)) return "image/gif";
  if (/\.webp(\?|#|$)/i.test(url)) return "image/webp";
  if (/\.png(\?|#|$)/i.test(url)) return "image/png";
  if (/\.jpe?g(\?|#|$)/i.test(url)) return "image/jpeg";
  return "";
}

type PixelBox = { x: number; y: number; width: number; height: number };

/** Keep a zoomed map image at screen resolution instead of the whole map's pixel size. */
function clipToMapViewport(parent: HTMLElement, box: PixelBox): PixelBox | null {
  const viewport = parent.closest(".map-viewport");
  const world = parent.closest(".map-world");
  if (!viewport || !world) return null;
  const view = viewport.getBoundingClientRect();
  const worldRect = world.getBoundingClientRect();
  const scaleX = world.clientWidth > 0 ? worldRect.width / world.clientWidth : 1;
  const scaleY = world.clientHeight > 0 ? worldRect.height / world.clientHeight : 1;
  const viewX = (view.left - worldRect.left) / scaleX;
  const viewY = (view.top - worldRect.top) / scaleY;
  const viewW = view.width / scaleX;
  const viewH = view.height / scaleY;
  const x = Math.max(box.x, viewX);
  const y = Math.max(box.y, viewY);
  const right = Math.min(box.x + box.width, viewX + viewW);
  const bottom = Math.min(box.y + box.height, viewY + viewH);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function placeCanvas(
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  placement?: Partial<MaterialPlacement> | null
) {
  const parent = canvas.parentElement;
  const destW = parent?.clientWidth || canvas.clientWidth || 1;
  const destH = parent?.clientHeight || canvas.clientHeight || 1;
  const box = placedRect(sourceWidth, sourceHeight, destW, destH, placement);
  const visible = parent ? (clipToMapViewport(parent, box) ?? box) : box;
  canvas.style.left = `${visible.x}px`;
  canvas.style.top = `${visible.y}px`;
  canvas.style.width = `${Math.max(0, visible.width)}px`;
  canvas.style.height = `${Math.max(0, visible.height)}px`;
  canvas.style.right = "auto";
  canvas.style.bottom = "auto";
  canvas.style.transform = placement?.flip ? "scaleX(-1)" : "none";
  canvas.width = Math.max(1, Math.floor(visible.width));
  canvas.height = Math.max(1, Math.floor(visible.height));
  return { ctx: canvas.getContext("2d", { alpha: true }), box, visible };
}

function drawFrame(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  placement?: Partial<MaterialPlacement> | null
) {
  const placed = placeCanvas(canvas, sourceWidth, sourceHeight, placement);
  if (!placed.ctx || placed.visible.width < 1 || placed.visible.height < 1 || placed.box.width < 1) return;
  const { ctx, box, visible } = placed;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  const sx = ((visible.x - box.x) / box.width) * sourceWidth;
  const sy = ((visible.y - box.y) / box.height) * sourceHeight;
  const sw = (visible.width / box.width) * sourceWidth;
  const sh = (visible.height / box.height) * sourceHeight;
  if (sw < 0.5 || sh < 0.5) return;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

function releaseCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}

function releaseGifFrames(frames: Array<{ rgba: Uint8ClampedArray }>) {
  for (const frame of frames) frame.rgba = new Uint8ClampedArray(0);
  frames.length = 0;
}

function ImageEffect({
  layer,
  playOnce,
  onFinished,
  onReady,
  layoutKey = "",
}: {
  layer: CanvasLayer;
  playOnce: boolean;
  onFinished?: () => void;
  onReady?: () => void;
  layoutKey?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFinishedRef = useRef(onFinished);
  const onReadyRef = useRef(onReady);
  const readyRef = useRef(false);
  const layerRef = useRef(layer);
  const paintRef = useRef<(() => void) | null>(null);
  onFinishedRef.current = onFinished;
  onReadyRef.current = onReady;
  layerRef.current = layer;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const timer = { id: 0 };
    let decoder: ImageDecoderLike | null = null;
    let bitmap: ImageBitmap | null = null;
    readyRef.current = false;
    paintRef.current = null;
    const markReady = () => {
      if (readyRef.current || cancelled) return;
      readyRef.current = true;
      onReadyRef.current?.();
    };
    const paintCanvas = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number
    ) => {
      const node = canvasRef.current;
      if (!node || cancelled) return;
      drawFrame(node, source, sourceWidth, sourceHeight, layerRef.current);
    };

    void (async () => {
      try {
      const response = await fetch(layer.localUrl);
      if (!response.ok || cancelled) {
        if (!cancelled) {
          markReady();
          if (playOnce) onFinishedRef.current?.();
        }
        return;
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const gif = isGifBytes(bytes);
      if (gif) {
        const animation = decodeGif(bytes);
        const scratch = document.createElement("canvas");
        scratch.width = animation.width;
        scratch.height = animation.height;
        const scratchCtx = scratch.getContext("2d", { alpha: true });
        if (!scratchCtx) {
          if (playOnce) onFinishedRef.current?.();
          return;
        }
        let index = 0;
        let drawn = 0;
        const paintFrame = () => {
          const frame = animation.frames[drawn];
          if (!frame) return;
          scratchCtx.putImageData(
            new ImageData(new Uint8ClampedArray(frame.rgba), animation.width, animation.height),
            0,
            0
          );
          paintCanvas(scratch, animation.width, animation.height);
        };
        paintRef.current = paintFrame;
        const step = () => {
          if (cancelled) return;
          drawn = index;
          paintFrame();
          markReady();
          const delay = animation.frames[drawn]?.delayMs ?? 100;
          index += 1;
          if (index >= animation.frames.length) {
            if (playOnce) {
              timer.id = window.setTimeout(() => {
                if (cancelled) return;
                releaseGifFrames(animation.frames);
                releaseCanvas(scratch);
                onFinishedRef.current?.();
              }, delay);
              return;
            }
            index = 0;
          }
          timer.id = window.setTimeout(step, delay);
        };
        step();
        return;
      }
      const headerType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      const mime = headerType || mimeFromUrl(layer.localUrl);
      const Decoder = (
        globalThis as {
          ImageDecoder?: new (init: {
            data: BufferSource;
            type: string;
            premultiplyAlpha?: "none";
            colorSpaceConversion?: "none";
          }) => ImageDecoderLike;
        }
      ).ImageDecoder;

      if (Decoder && mime.startsWith("image/")) {
        try {
          decoder = new Decoder({
            data: buffer,
            type: mime,
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
          });
          await decoder.tracks.ready;
          if (cancelled) return;
          const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
          if (count === 1) {
            const { image } = await decoder.decode({ frameIndex: 0 });
            if (cancelled) {
              image.close();
              return;
            }
            const scratch = document.createElement("canvas");
            scratch.width = image.displayWidth;
            scratch.height = image.displayHeight;
            scratch.getContext("2d")?.drawImage(image, 0, 0);
            image.close();
            decoder.close();
            decoder = null;
            const paint = () => paintCanvas(scratch, scratch.width, scratch.height);
            paintRef.current = paint;
            paint();
            markReady();
            if (playOnce) onFinishedRef.current?.();
            return;
          }
          const scratch = document.createElement("canvas");
          let index = 0;
          const paint = () => {
            if (scratch.width < 1) return;
            paintCanvas(scratch, scratch.width, scratch.height);
          };
          paintRef.current = paint;
          const step = async () => {
            if (cancelled || !decoder) return;
            const { image } = await decoder.decode({ frameIndex: index });
            if (cancelled) {
              image.close();
              return;
            }
            scratch.width = image.displayWidth;
            scratch.height = image.displayHeight;
            scratch.getContext("2d")?.drawImage(image, 0, 0);
            paint();
            markReady();
            const raw = image.duration ?? 0;
            const duration = raw > 1000 ? raw / 1000 : raw > 0 ? raw : 100;
            image.close();
            index += 1;
            const finished = index >= count;
            if (finished && playOnce) {
              timer.id = window.setTimeout(() => {
                if (cancelled) return;
                decoder?.close();
                decoder = null;
                onFinishedRef.current?.();
              }, Math.max(20, duration));
              return;
            }
            if (finished) index = 0;
            timer.id = window.setTimeout(() => void step(), Math.max(20, duration));
          };
          await step();
          return;
        } catch {
          decoder?.close();
          decoder = null;
        }
      }

      bitmap = await createImageBitmap(new Blob([bytes], { type: mime || headerType }));
      if (cancelled) {
        bitmap.close();
        bitmap = null;
        return;
      }
      const still = bitmap;
      const paint = () => paintCanvas(still, still.width, still.height);
      paintRef.current = paint;
      paint();
      markReady();
      if (playOnce) onFinishedRef.current?.();
      } catch {
        if (!cancelled) {
          markReady();
          if (playOnce) onFinishedRef.current?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      paintRef.current = null;
      window.clearTimeout(timer.id);
      decoder?.close();
      bitmap?.close();
    };
  }, [layer.localUrl, playOnce]);

  useLayoutEffect(() => {
    paintRef.current?.();
  }, [layer.x, layer.y, layer.scale, layer.flip, layoutKey]);

  return <canvas ref={canvasRef} className="effect-overlay" aria-label={layer.name} />;
}

function VideoEffect({
  layer,
  playOnce,
  onFinished,
  onReady,
  layoutKey = "",
}: {
  layer: CanvasLayer;
  playOnce: boolean;
  onFinished?: () => void;
  onReady?: () => void;
  layoutKey?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  function place(video: HTMLVideoElement) {
    const parent = video.parentElement;
    if (!parent || !video.videoWidth || !video.videoHeight) return;
    setBox(placedRect(video.videoWidth, video.videoHeight, parent.clientWidth, parent.clientHeight, layer));
  }

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (video) place(video);
  }, [layer.x, layer.y, layer.scale, layer.flip, layoutKey]);

  return (
    <video
      ref={videoRef}
      className="effect-overlay"
      src={layer.localUrl}
      autoPlay
      playsInline
      loop={!playOnce}
      aria-label={layer.name}
      onEnded={() => {
        if (playOnce) onFinishedRef.current?.();
      }}
      style={
        box
          ? {
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              right: "auto",
              bottom: "auto",
              opacity: 1,
              transform: layer.flip ? "scaleX(-1)" : "none",
            }
          : { opacity: 0 }
      }
      onLoadedMetadata={(event) => place(event.currentTarget)}
      onLoadedData={() => onReady?.()}
      onPlaying={() => onReady?.()}
    />
  );
}

export function EffectClip({
  layer,
  playOnce,
  onFinished,
  onReady,
  layoutKey,
}: {
  layer: CanvasLayer;
  playOnce: boolean;
  onFinished?: () => void;
  onReady?: () => void;
  layoutKey?: string;
}) {
  const [video, setVideo] = useState(isVideoClip(layer.localUrl));

  useEffect(() => {
    if (isVideoClip(layer.localUrl)) {
      setVideo(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(layer.localUrl);
        if (!response.ok || cancelled) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) setVideo(isVideoBytes(bytes));
      } catch {
        if (!cancelled) setVideo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layer.localUrl]);

  if (video) {
    return (
      <VideoEffect
        layer={layer}
        playOnce={playOnce}
        onFinished={onFinished}
        onReady={onReady}
        layoutKey={layoutKey}
      />
    );
  }
  return (
    <ImageEffect
      layer={layer}
      playOnce={playOnce}
      onFinished={onFinished}
      onReady={onReady}
      layoutKey={layoutKey}
    />
  );
}
