import { normalizePlacement, type MaterialPlacement } from "./canvasLayers";
import { buildPlayAssignments, type PlayTarget } from "./controlPlay";

export type ZoneLayer = {
  id: string;
  materialId: string;
  /** Label shown in the layer list. Falls back to the material name. */
  name?: string;
  x?: number;
  y?: number;
  scale?: number;
  /** Mirror the picture left to right. */
  flip?: boolean;
  hidden?: boolean;
  /** Set when this zone layer was placed by an NPC standing in the zone's scene area. */
  sourceMapLayerId?: string;
  /** Show Character Art instead of the map Avatar. */
  useCharacterArt?: boolean;
  /** Short label drawn on the control preview and beside the layer name. */
  markText?: string;
  /** Swatch drawn on the control preview and beside the layer name. */
  markColor?: string;
};

export type ZoneConfig = {
  number: 1 | 2 | 3 | 4;
  layers: ZoneLayer[];
  screenKey: string;
  speakerKey: string;
};

export function emptyZones(): ZoneConfig[] {
  return [1, 2, 3, 4].map((number) => ({
    number: number as ZoneConfig["number"],
    layers: [],
    screenKey: "",
    speakerKey: "",
  }));
}

export function screenKey(clientId: string, screenId: number) {
  return `${clientId}:${screenId}`;
}

export function parseTarget(key: string): PlayTarget | null {
  const split = key.lastIndexOf(":");
  if (split <= 0) return null;
  const clientId = key.slice(0, split);
  const screenId = Number(key.slice(split + 1));
  if (!clientId || !Number.isFinite(screenId)) return null;
  return { clientId, screenId };
}

export function reorderLayers(layers: ZoneLayer[], fromId: string, toId: string) {
  if (fromId === toId) return layers;
  const moving = layers.find((layer) => layer.id === fromId);
  if (!moving) return layers;
  const next = layers.filter((layer) => layer.id !== fromId);
  const index = next.findIndex((layer) => layer.id === toId);
  if (index < 0) return layers;
  next.splice(index, 0, moving);
  return next;
}

/** Move a layer one step. Up is toward position 1; down sits further back. */
export function shiftLayer(layers: ZoneLayer[], id: string, direction: -1 | 1) {
  const index = layers.findIndex((layer) => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return layers;
  const next = layers.slice();
  const [moving] = next.splice(index, 1);
  next.splice(target, 0, moving);
  return next;
}

/** A new copy of a material. The same material can be added more than once. */
export function nextLayer(layers: ZoneLayer[], materialId: string, scale = 1): ZoneLayer {
  const copies = layers.filter((layer) => layer.materialId === materialId).length;
  const used = new Set(layers.map((layer) => layer.id));
  let n = layers.length + 1;
  let id = `${materialId}-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `${materialId}-${n}`;
  }
  return {
    id,
    materialId,
    x: Math.min(0.4, copies * 0.08),
    y: Math.min(0.4, copies * 0.08),
    scale,
  };
}

export function addLayer(layers: ZoneLayer[], materialId: string) {
  return [nextLayer(layers, materialId, 1), ...layers];
}

export function activeLayers(layers: ZoneLayer[]) {
  return layers.filter((layer) => !layer.hidden);
}

/** Tell a connected screen to drop its picture when every material is gone. */
export function clearAssignments(screenKey: string, speakerKey: string) {
  const screen = parseTarget(screenKey);
  const speaker = parseTarget(speakerKey);
  const targets = [
    ...(screen ? [screen] : []),
    ...(speaker &&
    (!screen || screen.clientId !== speaker.clientId || screen.screenId !== speaker.screenId)
      ? [speaker]
      : []),
  ];
  if (targets.length === 0) return [];
  return buildPlayAssignments({ screens: targets, materialIds: [], once: false });
}

export function placementOf(layer: Partial<ZoneLayer> | MaterialPlacement): MaterialPlacement {
  return normalizePlacement(layer);
}

/** Put each environment-pack image on the zone with the same number. Does not send to screens. */
export function applyEnvironmentPack(
  zones: ZoneConfig[],
  pack: {
    zone1MaterialId?: string | null;
    zone2MaterialId?: string | null;
    zone3MaterialId?: string | null;
    zone4MaterialId?: string | null;
  }
) {
  const byNumber: Record<ZoneConfig["number"], string | null | undefined> = {
    1: pack.zone1MaterialId,
    2: pack.zone2MaterialId,
    3: pack.zone3MaterialId,
    4: pack.zone4MaterialId,
  };
  return zones.map((zone) => {
    const materialId = byNumber[zone.number];
    if (!materialId) return zone;
    if (zone.layers.some((layer) => layer.materialId === materialId)) return zone;
    return { ...zone, layers: addLayer(zone.layers, materialId) };
  });
}

/** Fill zones that do not yet have a screen, and default the speaker to that screen. */
export function assignOpenScreens(zones: ZoneConfig[], keys: string[]) {
  const used = new Set(zones.map((zone) => zone.screenKey).filter(Boolean));
  const available = keys.filter((key) => !used.has(key));
  let index = 0;
  return zones.map((zone) => {
    if (zone.screenKey || index >= available.length) return zone;
    const screen = available[index];
    index += 1;
    return {
      ...zone,
      screenKey: screen,
      speakerKey: zone.speakerKey || screen,
    };
  });
}

export function assignmentsForZone(
  zone: ZoneConfig,
  types: Map<string, string>
) {
  const layers = activeLayers(zone.layers);
  const ordered = layers.map((layer) => layer.materialId).filter((id) => types.has(id));
  if (ordered.length === 0) return clearAssignments(zone.screenKey, zone.speakerKey);
  const placements = layers
    .filter((layer) => ordered.includes(layer.materialId))
    .map((layer) => ({
      materialId: layer.materialId,
      instanceId: layer.id,
      ...(layer.useCharacterArt ? { useCharacterArt: true } : {}),
      ...(layer.flip ? { flip: true } : {}),
      ...placementOf(layer),
    }));

  const screen = parseTarget(zone.screenKey);
  const speaker = parseTarget(zone.speakerKey);
  const sounds = ordered.filter((id) => types.get(id)?.toUpperCase() === "SOUND");
  const visuals = ordered.filter((id) => types.get(id)?.toUpperCase() !== "SOUND");
  const split =
    screen &&
    speaker &&
    (screen.clientId !== speaker.clientId || screen.screenId !== speaker.screenId);

  if (split) {
    return [
      ...(visuals.length
        ? buildPlayAssignments({
            screens: [screen],
            materialIds: visuals,
            once: false,
            placements: placements.filter((item) => visuals.includes(item.materialId)),
          })
        : []),
      ...(sounds.length
        ? buildPlayAssignments({ screens: [speaker], materialIds: sounds, once: false })
        : []),
    ];
  }

  const target = screen ?? speaker;
  if (!target) return [];
  const materialIds = !screen && speaker ? sounds : ordered;
  if (materialIds.length === 0) return [];
  return buildPlayAssignments({
    screens: [target],
    materialIds,
    once: false,
    placements: !screen && speaker ? undefined : placements,
  });
}

export function assignmentsForZones(
  zones: ZoneConfig[],
  types: Map<string, string>
) {
  return zones.flatMap((zone) => assignmentsForZone(zone, types));
}
