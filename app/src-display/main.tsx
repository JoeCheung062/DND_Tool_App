import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  assignmentPlaysOnce,
  layoutCanvasLayers,
  shouldHoldPreviousScene,
  type CanvasLayer,
  type CanvasMaterial,
} from "../src/lib/canvasLayers";
import type { MapFrame } from "../src/lib/controlPlay";
import { mapCamera, mapGridLines } from "../src/lib/controlMap";
import { visibleEntries, type InitiativeBoard } from "../src/lib/initiative";
import { bindOneShot } from "../src/lib/soundDeck";
import { MapMeasureOverlay } from "../src/components/MapMeasureOverlay";
import type { MapMeasure } from "../src/lib/mapMeasure";
import { EffectClip } from "./EffectClip";
import "./display.css";

type DisplayViewApi = {
  getScreenId: () => number | null;
  onShow: (
    cb: (payload: {
      requestId: string;
      screenId: number;
      materialId?: string;
      combinationId?: string;
      once?: boolean;
      map?: MapFrame;
      materials?: CanvasMaterial[];
      content?: unknown;
      replyChannel: string;
    }) => void
  ) => () => void;
  onPaint: (cb: (payload: { requestId: string }) => void) => () => void;
  onInitiative: (cb: (board: InitiativeBoard) => void) => () => void;
  onMapFrame: (cb: (map: MapFrame) => void) => () => void;
  onMapMeasure: (cb: (measure: MapMeasure | null) => void) => () => void;
  requestInitiative: () => void;
  onSound: (
    cb: (payload: {
      channel: "bgm" | "effect";
      action: "play" | "pause" | "stop" | "seek" | "volume";
      volume: number;
      gain?: number;
      position?: number;
      material?: { id: string; name: string; localUrl: string };
    }) => void
  ) => () => void;
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

function DisplayScreen() {
  const screenId = useMemo(() => {
    const fromApi = window.displayViewApi?.getScreenId();
    if (typeof fromApi === "number") return fromApi;
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get("screenId"));
    return Number.isFinite(n) ? n : 0;
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const pendingRef = useRef<{
    requestId: string;
    materials: CanvasMaterial[];
    once: boolean;
    map: MapFrame | null;
  } | null>(null);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const sceneAudiosRef = useRef(new Map<string, { url: string; audio: HTMLAudioElement }>());
  const playedAudioRequest = useRef<string | null>(null);
  const gainRef = useRef(1);
  const cueRef = useRef<{
    requestId: string;
    left: number;
    started: boolean;
    sounds: CanvasLayer[];
  } | null>(null);
  const playbackRef = useRef<{ requestId: string; pending: number } | null>(null);
  const readyIds = useRef(new Set<string>());
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const effectsRef = useRef<HTMLAudioElement[]>([]);
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [heldLayers, setHeldLayers] = useState<CanvasLayer[]>([]);
  const [overlay, setOverlay] = useState<{ requestId: string; layers: CanvasLayer[] } | null>(null);
  const [bgmName, setBgmName] = useState<string | null>(null);
  const [effectName, setEffectName] = useState<string | null>(null);
  const [playOnce, setPlayOnce] = useState(false);
  const [mapView, setMapView] = useState<MapFrame | null>(null);
  const [mapMeasure, setMapMeasure] = useState<MapMeasure | null>(null);
  const [paintedRequest, setPaintedRequest] = useState<string | null>(null);
  const sceneRef = useRef({ layers: [] as CanvasLayer[] });
  sceneRef.current = { layers };
  const [message, setMessage] = useState("Standing by");
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [initiative, setInitiative] = useState<InitiativeBoard | null>(null);

  function finishPlaybackPiece(requestId: string) {
    const playback = playbackRef.current;
    if (!playback || playback.requestId !== requestId) return;
    playback.pending -= 1;
    if (playback.pending > 0) return;
    for (const audio of audiosRef.current) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audiosRef.current = [];
    playbackRef.current = null;
    setEffectName(null);
    setOverlay((current) => {
      if (!current || current.requestId !== requestId) return current;
      const images = current.layers.filter((layer) => layer.kind === "image");
      return images.length > 0 ? { ...current, layers: images } : null;
    });
  }

  useEffect(() => {
    const api = window.displayViewApi;
    if (!api) {
      setMessage("Display view API missing (open via Electron)");
      return;
    }

    const offShow = api.onShow((payload) => {
      const materials = payload.materials ?? [];
      pendingRef.current = {
        requestId: payload.requestId,
        materials,
        once: assignmentPlaysOnce(payload, materials),
        map: payload.map ?? null,
      };
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

    const offInitiative = api.onInitiative((board) => setInitiative(board));
    api.requestInitiative();

    const offSound = api.onSound((payload) => {
      const volume = Math.min(1, Math.max(0, payload.volume));
      if (typeof payload.gain === "number" && Number.isFinite(payload.gain)) {
        gainRef.current = Math.min(1, Math.max(0, payload.gain));
      }
      if (payload.channel === "bgm") {
        if (!bgmRef.current) {
          const audio = new Audio();
          audio.loop = true;
          bgmRef.current = audio;
        }
        const bgm = bgmRef.current;
        bgm.loop = true;
        bgm.volume = volume;
        const at =
          typeof payload.position === "number" && Number.isFinite(payload.position)
            ? Math.max(0, payload.position)
            : undefined;
        if (payload.action === "stop") {
          bgm.pause();
          bgm.currentTime = 0;
          delete bgm.dataset.track;
          setBgmName(null);
          return;
        }
        if (payload.action === "volume") return;
        if (payload.action === "pause") {
          bgm.pause();
          return;
        }
        if (payload.action === "seek") {
          if (at !== undefined) bgm.currentTime = at;
          return;
        }
        if (!payload.material) return;
        const same = bgm.dataset.track === payload.material.id && Boolean(bgm.src);
        if (!same) {
          bgm.src = payload.material.localUrl;
          bgm.dataset.track = payload.material.id;
          setBgmName(payload.material.name);
        }
        if (at !== undefined) bgm.currentTime = at;
        void bgm.play().catch(() => {
          // Autoplay can fail until the window is focused.
        });
        return;
      }
      if (payload.action !== "play" || !payload.material) return;
      const effect = bindOneShot(effectsRef.current, new Audio(payload.material.localUrl), undefined, volume);
      setEffectName(payload.material.name);
      void effect.play().catch(() => {
        const index = effectsRef.current.indexOf(effect);
        if (index >= 0) effectsRef.current.splice(index, 1);
      });
    });

    const offMap = api.onMapFrame((frame) => {
      setMapView((current) => (current ? { ...current, ...frame } : current));
    });
    const offMeasure = api.onMapMeasure((measure) => setMapMeasure(measure));

    const offPaint = api.onPaint((payload) => {
      const pending = pendingRef.current;
      if (!pending || pending.requestId !== payload.requestId) return;
      setPlayOnce(pending.once);
      const nextLayers = layoutCanvasLayers(pending.materials);
      if (pending.once) {
        setOverlay({ requestId: pending.requestId, layers: nextLayers });
      } else {
        setOverlay(null);
        const previous = sceneRef.current.layers.filter((layer) => layer.kind !== "sound");
        const nextVisual = nextLayers.filter((layer) => layer.kind !== "sound");
        const hold = shouldHoldPreviousScene(
          previous.map((layer) => layer.id),
          nextVisual.map((layer) => layer.id)
        );
        readyIds.current = new Set();
        setHeldLayers(hold ? previous : []);
        setLayers(nextLayers);
        setMapView(pending.map);
        if (!pending.map) setMapMeasure(null);
      }
      setPaintedRequest(payload.requestId);
      setAuthed(true);
    });

    return () => {
      offShow();
      offInitiative();
      offSound();
      offPaint();
      offMap();
      offMeasure();
      bgmRef.current?.pause();
      for (const effect of effectsRef.current) effect.pause();
      effectsRef.current = [];
    };
  }, []);

  function beginOnceAudio(requestId: string) {
    const cue = cueRef.current;
    if (!cue || cue.requestId !== requestId || cue.started) return;
    cue.started = true;
    for (const layer of cue.sounds) {
      const audio = new Audio(layer.localUrl);
      audio.loop = false;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        finishPlaybackPiece(requestId);
      };
      bindOneShot(audiosRef.current, audio, done, gainRef.current);
      void audio.play().catch(done);
    }
  }

  function noteOverlayReady(requestId: string) {
    const cue = cueRef.current;
    if (!cue || cue.requestId !== requestId || cue.started) return;
    cue.left -= 1;
    if (cue.left <= 0) beginOnceAudio(requestId);
  }

  useEffect(() => {
    if (!paintedRequest) return;
    if (playedAudioRequest.current === paintedRequest) return;
    playedAudioRequest.current = paintedRequest;
    const once = pendingRef.current?.once === true;
    if (once) {
      const source = overlay?.layers ?? [];
      const sounds = source.filter((item) => item.kind === "sound");
      const effects = source.filter((item) => item.kind === "effect");
      const visuals = source.filter((item) => item.kind !== "sound");
      for (const audio of audiosRef.current) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      audiosRef.current = [];
      const pieces = sounds.length + effects.length;
      if (pieces > 0) playbackRef.current = { requestId: paintedRequest, pending: pieces };
      cueRef.current = {
        requestId: paintedRequest,
        left: visuals.length,
        started: false,
        sounds,
      };
      if (visuals.length === 0) beginOnceAudio(paintedRequest);
      else window.setTimeout(() => beginOnceAudio(paintedRequest), 1200);
      return;
    }
    for (const audio of audiosRef.current) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audiosRef.current = [];
    playbackRef.current = null;
    const sounds = layers.filter((item) => item.kind === "sound");
    const next = new Map(sounds.map((layer) => [layer.id, layer.localUrl]));
    for (const [id, entry] of sceneAudiosRef.current) {
      if (next.get(id) === entry.url) continue;
      entry.audio.pause();
      entry.audio.removeAttribute("src");
      entry.audio.load();
      sceneAudiosRef.current.delete(id);
    }
    for (const layer of sounds) {
      if (sceneAudiosRef.current.has(layer.id)) continue;
      const audio = new Audio(layer.localUrl);
      audio.loop = true;
      sceneAudiosRef.current.set(layer.id, { url: layer.localUrl, audio });
      void audio.play().catch(() => {
        // Autoplay can fail until the window is focused.
      });
    }
  }, [layers, overlay, paintedRequest, playOnce]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const root = node.parentElement;
    const update = () => {
      const screen = root?.getBoundingClientRect();
      const screenWidth = root?.clientWidth || screen?.width || 0;
      const screenHeight = root?.clientHeight || screen?.height || 0;
      const layoutWidth = screenHeight > 0 ? (screenHeight * 16) / 9 : screenWidth;
      const stretch = layoutWidth > 0 ? screenWidth / layoutWidth : 1;
      node.style.width = `${layoutWidth}px`;
      node.style.height = `${screenHeight}px`;
      node.style.transformOrigin = "top left";
      node.style.transform = `scaleX(${stretch})`;
      setStageSize((current) =>
        Math.abs(current.width - layoutWidth) < 0.5 && Math.abs(current.height - screenHeight) < 0.5
          ? current
          : { width: layoutWidth, height: screenHeight }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (root) observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const sounds = [
    ...layers.filter((layer) => layer.kind === "sound"),
    ...(overlay?.layers.filter((layer) => layer.kind === "sound") ?? []),
  ];
  const showingPicture =
    layers.some((layer) => layer.kind !== "sound") ||
    heldLayers.length > 0 ||
    Boolean(overlay?.layers.some((layer) => layer.kind !== "sound"));
  const showIdle = !showingPicture;
  const layoutKey = `${Math.round(stageSize.width)}x${Math.round(stageSize.height)}:${mapView ? `${mapView.zoom ?? 1}:${mapView.focusCol}:${mapView.focusRow}` : "screen"}`;
  const sceneVisuals = layers.filter((layer) => layer.kind !== "sound");
  function noteSceneReady(layerId: string) {
    if (heldLayers.length === 0) return;
    readyIds.current.add(layerId);
    if (readyIds.current.size >= sceneVisuals.length) setHeldLayers([]);
  }
  const overlayVisuals = overlay?.layers.filter((layer) => layer.kind !== "sound") ?? [];
  const clips = (
    <>
      {heldLayers.map((layer, index) => (
        <div key={`scene:${layer.id}`} className="layer-stage" style={{ zIndex: heldLayers.length - index }}>
          <EffectClip layer={layer} playOnce={false} layoutKey={layoutKey} />
        </div>
      ))}
      {sceneVisuals.map((layer, index) => (
        <div
          key={`scene:${layer.id}`}
          className="layer-stage"
          style={{
            zIndex: 20 + sceneVisuals.length - index,
            opacity: heldLayers.length > 0 ? 0 : 1,
          }}
        >
          <EffectClip layer={layer} playOnce={false} layoutKey={layoutKey} onReady={() => noteSceneReady(layer.id)} />
        </div>
      ))}
      {overlayVisuals.map((layer, index) => (
        <div key={`overlay:${overlay?.requestId}:${layer.id}`} className="layer-stage" style={{ zIndex: 40 + index }}>
          <EffectClip
            layer={layer}
            playOnce={layer.kind === "effect"}
            layoutKey={layoutKey}
            onReady={() => noteOverlayReady(overlay?.requestId ?? "")}
            onFinished={
              layer.kind === "effect" ? () => finishPlaybackPiece(overlay?.requestId ?? "") : undefined
            }
          />
        </div>
      ))}
    </>
  );

  const camera = mapView ? mapCamera(mapView, stageSize.width, stageSize.height) : null;
  const gridLines = mapView ? mapGridLines(mapView, stageSize.width, stageSize.height) : [];
  return (
    <div className="display-root">
      <div ref={stageRef} className="display-stage">
      <canvas className="display-canvas" />
      {mapView && camera ? (
        <div className="map-viewport">
          <div
            className="map-world"
            style={{
              width: camera.worldWidth,
              height: camera.worldHeight,
              left: camera.originX,
              top: camera.originY,
            }}
          >
            {clips}
          </div>
          <svg
            className="display-map-grid"
            viewBox={`0 0 ${Math.max(1, stageSize.width)} ${Math.max(1, stageSize.height)}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {gridLines.map((line, index) => (
              <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </svg>
          {mapMeasure ? (
            <div
              className="map-measure-host"
              style={{
                left: camera.originX,
                top: camera.originY,
                width: camera.worldWidth,
                height: camera.worldHeight,
              }}
            >
              <MapMeasureOverlay
                measure={mapMeasure}
                cell={camera.cell}
                width={camera.worldWidth}
                height={camera.worldHeight}
              />
            </div>
          ) : null}
        </div>
      ) : (
        clips
      )}
      </div>
      {initiative?.barVisible && visibleEntries(initiative).length > 0 ? (
        <div className="initiative-bar">
          <span className="initiative-title">Initiative</span>
          {visibleEntries(initiative).map((entry) => (
              <span key={entry.id} className={entry.id === initiative.turnId ? "initiative-slot on" : "initiative-slot"}>
                <span className="initiative-slot-main">
                  {entry.name}
                  <em>{entry.speed}</em>
                </span>
                {entry.hpVisible ? (
                  <span className="initiative-slot-hp" aria-label={`Health ${entry.hp} / ${entry.maxHp}`}>
                    <span className="initiative-hp-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${entry.maxHp > 0 ? Math.max(0, Math.min(100, (entry.hp / entry.maxHp) * 100)) : 0}%`,
                        }}
                      />
                    </span>
                    <em>
                      {entry.hp} / {entry.maxHp}
                    </em>
                  </span>
                ) : null}
              </span>
          ))}
        </div>
      ) : null}
      <div className="display-chrome">
        <span>Screen {screenId}</span>
        <span>{authed ? "Authenticated" : "Awaiting authentication"}</span>
        <span>{message}</span>
        {bgmName ? <span>BGM {bgmName}</span> : null}
        {effectName ? <span>Effect {effectName}</span> : null}
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
