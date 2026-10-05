import { matchesLibraryQuery, soundGroup, type LibraryMaterial } from "./controlLibrary";

export type SoundChannel = "bgm" | "effect";
export type SoundAction = "play" | "pause" | "stop" | "seek" | "volume";

/** Clock label for the BGM player, rounded down to the second. */
export function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remain = whole % 60;
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}

/** Advance a looping single track. Past the end, playback starts again at the top. */
export function advanceLoop(position: number, delta: number, duration: number) {
  const next = Math.max(0, position) + Math.max(0, delta);
  if (!Number.isFinite(duration) || duration <= 0) return next;
  if (next < duration) return next;
  return next % duration;
}

export type SpeakerTarget = {
  clientId: string;
  screenId: number;
};

/** Every connected Display Mode screen is a speaker. */
export function allSpeakers(
  displays: Array<{ clientId: string; screens?: Array<{ id: number }> }>
): SpeakerTarget[] {
  const seen = new Set<string>();
  const targets: SpeakerTarget[] = [];
  for (const display of displays) {
    for (const screen of display.screens ?? []) {
      const key = `${display.clientId}:${screen.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ clientId: display.clientId, screenId: screen.id });
    }
  }
  return targets;
}

/** Drop one screen, such as the map, from a play target list. */
export function withoutScreen(targets: SpeakerTarget[], skip: SpeakerTarget | null | undefined) {
  if (!skip) return targets;
  return targets.filter(
    (target) => target.clientId !== skip.clientId || target.screenId !== skip.screenId
  );
}

export function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export type OneShotAudio = {
  loop: boolean;
  volume: number;
  src?: string;
  load?: () => void;
  removeAttribute?: (name: string) => void;
  addEventListener: (type: "ended" | "error", listener: () => void) => void;
};

/** Drop the decoded media buffer once a one-shot clip has finished. */
export function releaseMediaElement(shot: {
  src?: string;
  removeAttribute?: (name: string) => void;
  load?: () => void;
}) {
  if (typeof shot.removeAttribute === "function") shot.removeAttribute("src");
  else if (typeof shot.src === "string") shot.src = "";
  shot.load?.();
}

/**
 * A click starts one play-through. The element stays referenced until it ends
 * so several effects can sound together, and so playback is not discarded early.
 * When it ends, the media buffer is released.
 */
export function bindOneShot<T extends OneShotAudio>(
  active: T[],
  shot: T,
  onDone?: () => void,
  volume = 1
) {
  shot.loop = false;
  shot.volume = clampVolume(volume);
  active.push(shot);
  const release = () => {
    const index = active.indexOf(shot);
    if (index >= 0) active.splice(index, 1);
    releaseMediaElement(shot);
    onDone?.();
  };
  shot.addEventListener("ended", release);
  shot.addEventListener("error", release);
  return shot;
}

/** BGM tracks switch as one bed. Everything else is a one-shot effect. */
export function partitionSoundDeck<T extends LibraryMaterial>(materials: T[]) {
  const bgm: T[] = [];
  const effects: T[] = [];
  for (const material of materials) {
    if (material.type.toUpperCase() !== "SOUND") continue;
    if (soundGroup(material) === "bgm") bgm.push(material);
    else effects.push(material);
  }
  return { bgm, effects };
}

export type EffectListFilter = "all" | "effect" | "general";

/** Search and tag/group filters for the one-shot effect list. BGM is already excluded. */
export function filterSoundEffects<T extends LibraryMaterial>(
  effects: T[],
  options: { query: string; tagId?: string; group?: EffectListFilter }
) {
  const group = options.group ?? "all";
  return effects.filter((item) => {
    if (group !== "all" && soundGroup(item) !== group) return false;
    if (options.tagId && !item.tags.some((tag) => tag.id === options.tagId)) return false;
    return matchesLibraryQuery(item, options.query);
  });
}
