import { normalizePlacement, type MaterialPlacement } from "./canvasLayers";
import type { ZoneConfig, ZoneLayer } from "./controlZones";

export type ScenePoint = { x: number; y: number };

export type SceneLabel = {
  zone: 1 | 2 | 3 | 4;
  corners: [ScenePoint, ScenePoint, ScenePoint, ScenePoint];
};

export const SCENE_ZONE_COLOR: Record<SceneLabel["zone"], string> = {
  1: "#5eead4",
  2: "#fbbf24",
  3: "#60a5fa",
  4: "#f472b6",
};

/** Default facing of each zone, from the scene center. */
export const ZONE_DIRECTION: Record<SceneLabel["zone"], "Up" | "Left" | "Right" | "Down"> = {
  1: "Up",
  2: "Left",
  3: "Right",
  4: "Down",
};

export function zoneHeading(zone: number) {
  const direction = ZONE_DIRECTION[zone as SceneLabel["zone"]];
  return direction ? `Zone ${zone} · ${direction}` : `Zone ${zone}`;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function rect(x: number, y: number, width: number, height: number): SceneLabel["corners"] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function defaultSceneLabels(): SceneLabel[] {
  return [
    { zone: 1, corners: rect(0.38, 0.1, 0.24, 0.34) },
    { zone: 2, corners: rect(0.06, 0.18, 0.28, 0.64) },
    { zone: 3, corners: rect(0.66, 0.16, 0.28, 0.66) },
    { zone: 4, corners: rect(0.38, 0.54, 0.24, 0.34) },
  ];
}

export function scenePoint(value: unknown): ScenePoint | null {
  if (typeof value !== "object" || value === null) return null;
  const point = value as { x?: unknown; y?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

export function sceneLabelsOf(value: unknown): SceneLabel[] {
  if (!Array.isArray(value)) return defaultSceneLabels();
  const labels: SceneLabel[] = [];
  for (const zone of [1, 2, 3, 4] as const) {
    const item = value.find(
      (entry) => typeof entry === "object" && entry !== null && (entry as { zone?: unknown }).zone === zone
    ) as { corners?: unknown } | undefined;
    const corners = Array.isArray(item?.corners) ? item.corners.map(scenePoint) : [];
    if (corners.length === 4 && corners.every((corner): corner is ScenePoint => corner !== null)) {
      labels.push({ zone, corners: corners as SceneLabel["corners"] });
    } else {
      const fallback = defaultSceneLabels().find((label) => label.zone === zone);
      if (fallback) labels.push(fallback);
    }
  }
  return labels;
}

/** Map placement is an offset from the center of the map, as a fraction of the map. */
export function layerWorldPoint(layer: { x?: number; y?: number }): ScenePoint {
  const place = normalizePlacement(layer);
  return { x: clamp01(0.5 + place.x), y: clamp01(0.5 + place.y) };
}

export function pointInPolygon(point: ScenePoint, corners: ScenePoint[]) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
    const a = corners[i];
    const b = corners[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

function polygonArea(corners: ScenePoint[]) {
  let sum = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const next = corners[(i + 1) % corners.length];
    sum += corners[i].x * next.y - next.x * corners[i].y;
  }
  return Math.abs(sum) / 2;
}

export const DEFAULT_SCENE_CENTER: ScenePoint = { x: 0.5, y: 0.5 };
/** Synced NPC art sits just under the middle of the zone and keeps scale 1. */
export const ZONE_NPC_Y = 0.1;

export function sceneCenterOf(value: unknown): ScenePoint {
  return scenePoint(value) ?? DEFAULT_SCENE_CENTER;
}

function labelSpan(label: SceneLabel) {
  const xs = label.corners.map((corner) => corner.x);
  const ys = label.corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function clampZone(value: number) {
  return Math.min(0.5, Math.max(-0.5, value));
}

function project(point: ScenePoint, origin: ScenePoint, axis: ScenePoint) {
  return (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y;
}

/**
 * Zone placement seen from the red center, looking at this zone.
 * Left and right are across that view. For a zone on the left of the center,
 * standing higher on the map is further to the right, not higher on the screen.
 */
export function placementInsideLabel(
  point: ScenePoint,
  label: SceneLabel,
  center?: ScenePoint
): MaterialPlacement | null {
  if (!pointInPolygon(point, label.corners)) return null;
  const box = labelSpan(label);
  const origin = center ?? {
    x: box.minX + box.width / 2,
    y: box.minY + box.height / 2,
  };
  const mid = {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
  let vx = mid.x - origin.x;
  let vy = mid.y - origin.y;
  const vlen = Math.hypot(vx, vy);
  if (vlen < 0.02) {
    const width = box.width || 1;
    const height = box.height || 1;
    return normalizePlacement({
      x: clampZone((point.x - origin.x) / width),
      y: clampZone((point.y - origin.y) / height),
      scale: 1,
    });
  }
  vx /= vlen;
  vy /= vlen;
  const right = { x: -vy, y: vx };
  const forward = { x: vx, y: vy };
  const lateral = project(point, origin, right);
  const depth = project(point, origin, forward);
  const latReach = Math.max(
    ...label.corners.map((corner) => Math.abs(project(corner, origin, right))),
    1e-4
  );
  const depReach = Math.max(
    ...label.corners.map((corner) => Math.abs(project(corner, origin, forward))),
    1e-4
  );
  return normalizePlacement({
    x: clampZone(lateral / (2 * latReach)),
    y: clampZone(-depth / (2 * depReach)),
    scale: 1,
  });
}

export function moveSceneLabel(label: SceneLabel, dx: number, dy: number): SceneLabel {
  return {
    ...label,
    corners: label.corners.map((corner) => ({
      x: clamp01(corner.x + dx),
      y: clamp01(corner.y + dy),
    })) as SceneLabel["corners"],
  };
}

/** Nearest grid-line crossing. Columns and rows are the map grid counts. */
export function snapScenePoint(point: ScenePoint, columns: number, rows: number): ScenePoint {
  const cols = Math.max(1, Math.round(columns) || 1);
  const rowCount = Math.max(1, Math.round(rows) || 1);
  const x = clamp01(point.x);
  const y = clamp01(point.y);
  return {
    x: clamp01(Math.round(x * cols) / cols),
    y: clamp01(Math.round(y * rowCount) / rowCount),
  };
}

export function moveSceneCorner(label: SceneLabel, index: number, point: ScenePoint): SceneLabel {
  const corners = label.corners.map((corner, cornerIndex) =>
    cornerIndex === index ? { x: clamp01(point.x), y: clamp01(point.y) } : corner
  ) as SceneLabel["corners"];
  return { ...label, corners };
}

type NpcMaterial = { npc?: boolean; characterArtUrl?: string | null; characterArtLocalUrl?: string | null };

/**
 * In normal map mode, an NPC avatar inside a zone label adds that NPC's
 * Character Art to the zone. Left and right follow the view from the red
 * center toward that zone, so a higher map position is not the top of the screen.
 */
export function syncNpcZones(
  zones: ZoneConfig[],
  mapLayers: ZoneLayer[],
  labels: SceneLabel[],
  library: Map<string, NpcMaterial>,
  center: ScenePoint = DEFAULT_SCENE_CENTER
): ZoneConfig[] {
  const wanted = new Map<
    string,
    {
      zone: SceneLabel["zone"];
      placement: MaterialPlacement;
      materialId: string;
      useCharacterArt: boolean;
    }
  >();
  for (const layer of mapLayers) {
    if (layer.hidden) continue;
    const material = library.get(layer.materialId);
    if (!material?.npc || !(material.characterArtUrl || material.characterArtLocalUrl)) continue;
    const point = layerWorldPoint(layer);
    let best: { label: SceneLabel; area: number } | null = null;
    for (const label of labels) {
      const placement = placementInsideLabel(point, label, center);
      if (!placement) continue;
      const area = polygonArea(label.corners);
      if (!best || area < best.area) best = { label, area };
    }
    if (!best) continue;
    const placement = placementInsideLabel(point, best.label, center);
    if (!placement) continue;
    wanted.set(layer.id, {
      zone: best.label.zone,
      placement: { x: placement.x, y: ZONE_NPC_Y, scale: 1 },
      materialId: layer.materialId,
      useCharacterArt: layer.useCharacterArt !== false,
    });
  }

  let changed = false;
  const next = zones.map((zone) => {
    let zoneChanged = false;
    const kept = zone.layers.filter((layer) => {
      if (!layer.sourceMapLayerId) return true;
      const match = wanted.get(layer.sourceMapLayerId);
      if (!match || match.zone !== zone.number) {
        zoneChanged = true;
        return false;
      }
      return true;
    });
    const layers = kept.map((layer) => {
      if (!layer.sourceMapLayerId) return layer;
      const match = wanted.get(layer.sourceMapLayerId);
      if (!match) return layer;
      const place = match.placement;
      if (
        layer.x === place.x &&
        layer.y === place.y &&
        layer.useCharacterArt === match.useCharacterArt &&
        layer.materialId === match.materialId
      ) {
        return layer;
      }
      zoneChanged = true;
      return {
        ...layer,
        materialId: match.materialId,
        useCharacterArt: match.useCharacterArt,
        x: place.x,
        y: place.y,
      };
    });
    for (const [mapLayerId, match] of wanted) {
      if (match.zone !== zone.number) continue;
      if (layers.some((layer) => layer.sourceMapLayerId === mapLayerId)) continue;
      zoneChanged = true;
      layers.unshift({
        id: `npc-${mapLayerId}`,
        materialId: match.materialId,
        sourceMapLayerId: mapLayerId,
        useCharacterArt: match.useCharacterArt,
        ...match.placement,
      });
    }
    if (!zoneChanged) return zone;
    changed = true;
    return { ...zone, layers };
  });
  return changed ? next : zones;
}
