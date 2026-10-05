import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { soundGroup, soundGroupLabel, type LibraryMaterial } from "../lib/controlLibrary";
import {
  advanceLoop,
  filterSoundEffects,
  formatClock,
  partitionSoundDeck,
  type EffectListFilter,
} from "../lib/soundDeck";
import { AudioPrint } from "./AudioPrint";

type SoundDeckProps = {
  materials: LibraryMaterial[];
  speakerCount: number;
  disabled?: boolean;
  onBgm: (materialId: string, volume: number, position: number) => void;
  onPauseBgm: (volume: number) => void;
  onSeekBgm: (position: number, volume: number) => void;
  onStopBgm: (volume: number) => void;
  onVolume: (volume: number) => void;
};

export function SoundDeck({
  materials,
  speakerCount,
  disabled,
  onBgm,
  onPauseBgm,
  onSeekBgm,
  onStopBgm,
  onVolume,
}: SoundDeckProps) {
  const { bgm } = partitionSoundDeck(materials);
  const [volume, setVolume] = useState(80);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragging = useRef(false);
  const pointerDown = useRef(false);
  const level = volume / 100;
  const levelRef = useRef(level);
  levelRef.current = level;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const active = bgm.find((track) => track.id === activeId);

  function changeVolume(next: number) {
    setVolume(next);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => onVolume(next / 100), 80);
  }

  function playTrack(id: string, from = 0) {
    setActiveId(id);
    setPosition(from);
    setPlaying(true);
    onBgm(id, levelRef.current, from);
  }

  function togglePlay() {
    if (!activeId) return;
    if (playing) {
      setPlaying(false);
      onPauseBgm(levelRef.current);
      return;
    }
    setPlaying(true);
    onBgm(activeId, levelRef.current, position);
  }

  function stopTrack() {
    setPlaying(false);
    setPosition(0);
    onStopBgm(levelRef.current);
  }

  function previewSeek(next: number) {
    dragging.current = true;
    setPosition(next);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      if (!pointerDown.current) dragging.current = false;
      onSeekBgm(next, levelRef.current);
    }, 80);
  }

  useEffect(() => {
    if (!active?.localUrl) {
      setDuration(0);
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    const ready = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.addEventListener("loadedmetadata", ready);
    audio.src = active.localUrl;
    return () => {
      audio.removeEventListener("loadedmetadata", ready);
      audio.removeAttribute("src");
      audio.load();
    };
  }, [active?.localUrl]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      if (!dragging.current) {
        setPosition((current) => advanceLoop(current, delta, durationRef.current));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <section className="sound-deck" aria-label="Background music">
      <div className="sound-panel">
        <h2>BGM</h2>
        <p className="muted">
          Every speaker
          {speakerCount > 0 ? ` · ${speakerCount} connected` : ""}
        </p>
        <div className="bgm-player">
          <div className="bgm-player-head">
            <strong>{active ? active.name : "No BGM playing"}</strong>
            <span className="bgm-loop" title="This song repeats until you stop it">
              <LoopOneIcon />
              Loop
            </span>
          </div>
          <AudioPrint url={active?.localUrl} />
          <label className="bgm-seek">
            <span>{formatClock(position)}</span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.1}
              value={duration > 0 ? Math.min(position, duration) : 0}
              aria-label="Playback position"
              style={rangeFill(duration > 0 ? Math.min(position, duration) : 0, 0, duration > 0 ? duration : 1)}
              disabled={disabled || !active || duration <= 0}
              onPointerDown={() => {
                pointerDown.current = true;
                dragging.current = true;
              }}
              onPointerUp={() => {
                pointerDown.current = false;
                dragging.current = false;
              }}
              onChange={(event) => previewSeek(Number(event.target.value))}
            />
            <span>{formatClock(duration)}</span>
          </label>
          <div className="bgm-transport">
            <button type="button" className="btn tiny" disabled={disabled || !active} onClick={togglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" className="btn tiny ghost" disabled={disabled || !active} onClick={stopTrack}>
              <StopIcon />
              Stop
            </button>
          </div>
        </div>
        <label className="volume-row">
          Volume
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            style={rangeFill(volume, 0, 100)}
            aria-valuetext={`${volume}%`}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
          <span className="mono">{volume}%</span>
        </label>
        <div className="effect-grid">
          {bgm.map((track) => (
            <button
              key={track.id}
              type="button"
              className={track.id === activeId ? "effect-card on" : "effect-card"}
              disabled={disabled}
              onClick={() => playTrack(track.id)}
            >
              <strong>{track.name}</strong>
              <AudioPrint url={track.localUrl} />
            </button>
          ))}
        </div>
        {bgm.length === 0 ? (
          <p className="muted">No BGM in this campaign. Tag a sound “bgm” or “music”.</p>
        ) : null}
      </div>
    </section>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  return { "--fill": `${pct}%` } as CSSProperties;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6.5v11l10-5.5-10-5.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 6h3.2v12H7V6Zm6.8 0H17v12h-3.2V6Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function LoopOneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h8.5a3.5 3.5 0 0 1 0 7H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M8.5 10.5 6 7l2.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.2 17.2v-4.2l-1.3.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SoundEffectList({
  materials,
  disabled,
  onEffect,
  onPreview,
}: {
  materials: LibraryMaterial[];
  disabled?: boolean;
  onEffect: (materialId: string) => void;
  onPreview: (materialId: string) => void;
}) {
  const effects = partitionSoundDeck(materials).effects;
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [group, setGroup] = useState<EffectListFilter>("all");
  const effectTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const effect of effects) {
      for (const tag of effect.tags) map.set(tag.id, tag.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [effects]);
  const shown = filterSoundEffects(effects, { query, tagId, group });

  return (
    <div className="sound-effects" aria-label="Sound effects">
      <p className="muted">Click a sound to play it once on every speaker at the same time.</p>
      <div className="effect-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or tag"
          aria-label="Search sound effects by name or tag"
        />
        <label>
          Tag
          <select value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">All tags</option>
            {effectTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <div className="chip-row">
          {(
            [
              ["all", "All"],
              ["effect", soundGroupLabel("effect")],
              ["general", soundGroupLabel("general")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={group === value ? "chip on" : "chip"}
              onClick={() => setGroup(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="effect-grid">
        {effects.length === 0 ? (
          <p className="muted">No sound effects downloaded.</p>
        ) : shown.length === 0 ? (
          <p className="muted">No sound effects match.</p>
        ) : null}
        {shown.map((effect) => (
          <article key={effect.id} className="effect-card">
            <div className="effect-card-name">
              <strong>{effect.name}</strong>
              {soundGroup(effect) === "general" ? <span className="effect-tag">General</span> : null}
            </div>
            <AudioPrint url={effect.localUrl} />
            <div className="effect-card-actions">
              <button type="button" className="btn tiny" disabled={disabled} onClick={() => onEffect(effect.id)}>
                Play
              </button>
              <button type="button" className="btn tiny ghost" onClick={() => onPreview(effect.id)}>
                Preview
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
