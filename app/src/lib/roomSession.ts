import type { MapScreenConfig } from "./controlMap";
import type { ZoneConfig, ZoneLayer } from "./controlZones";
import { healthOf, type InitiativeBoard, type InitiativeEntry } from "./initiative";
import { sceneCenterOf, sceneLabelsOf } from "./sceneMode";

export type RoomMarks = {
  texts: string[];
  colors: string[];
};

export type RoomSession = {
  zones: ZoneConfig[];
  activeZone: ZoneConfig["number"];
  zoneView: "all" | "map" | ZoneConfig["number"];
  map: MapScreenConfig;
  initiative: InitiativeBoard;
  marks: RoomMarks;
  /** Output gain for each connected speaker, keyed by clientId:screenId. */
  speakerVolumes: Record<string, number>;
};

export function emptyMarks(): RoomMarks {
  return { texts: [], colors: [] };
}

export function rememberText(marks: RoomMarks, text: string): RoomMarks {
  const word = text.trim();
  if (!word) return marks;
  if (marks.texts.some((item) => item.toLowerCase() === word.toLowerCase())) return marks;
  return { ...marks, texts: [...marks.texts, word] };
}

export function rememberColor(marks: RoomMarks, color: string): RoomMarks {
  const hex = color.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return marks;
  if (marks.colors.includes(hex)) return marks;
  return { ...marks, colors: [...marks.colors, hex] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function layerOf(value: unknown): ZoneLayer | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.materialId !== "string") {
    return null;
  }
  const layer: ZoneLayer = { id: value.id, materialId: value.materialId };
  if (typeof value.name === "string" && value.name.trim()) layer.name = value.name;
  if (value.hidden === true) layer.hidden = true;
  if (typeof value.x === "number" && Number.isFinite(value.x)) layer.x = value.x;
  if (typeof value.y === "number" && Number.isFinite(value.y)) layer.y = value.y;
  if (typeof value.scale === "number" && Number.isFinite(value.scale)) layer.scale = value.scale;
  if (value.flip === true) layer.flip = true;
  if (typeof value.sourceMapLayerId === "string" && value.sourceMapLayerId) {
    layer.sourceMapLayerId = value.sourceMapLayerId;
  }
  if (value.useCharacterArt === true || value.useCharacterArt === false) {
    layer.useCharacterArt = value.useCharacterArt;
  }
  if (typeof value.markText === "string" && value.markText.trim()) layer.markText = value.markText.trim();
  if (typeof value.markColor === "string" && /^#[0-9a-fA-F]{6}$/.test(value.markColor)) {
    layer.markColor = value.markColor.toLowerCase();
  }
  return layer;
}

function marksOf(value: unknown): RoomMarks {
  if (!isRecord(value)) return emptyMarks();
  const texts: string[] = [];
  const colors: string[] = [];
  if (Array.isArray(value.texts)) {
    for (const item of value.texts) {
      if (typeof item !== "string") continue;
      const word = item.trim();
      if (!word || texts.some((saved) => saved.toLowerCase() === word.toLowerCase())) continue;
      texts.push(word);
    }
  }
  if (Array.isArray(value.colors)) {
    for (const item of value.colors) {
      if (typeof item !== "string" || !/^#[0-9a-fA-F]{6}$/.test(item)) continue;
      const hex = item.toLowerCase();
      if (!colors.includes(hex)) colors.push(hex);
    }
  }
  return { texts, colors };
}

function zonesOf(value: unknown): ZoneConfig[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const parsed: ZoneConfig[] = [];
  for (let index = 0; index < 4; index += 1) {
    const zone = value[index];
    const number = (index + 1) as ZoneConfig["number"];
    if (!isRecord(zone) || zone.number !== number || !Array.isArray(zone.layers)) return null;
    const layers: ZoneLayer[] = [];
    for (const item of zone.layers) {
      const layer = layerOf(item);
      if (!layer) return null;
      layers.push(layer);
    }
    parsed.push({
      number,
      layers,
      screenKey: typeof zone.screenKey === "string" ? zone.screenKey : "",
      speakerKey: typeof zone.speakerKey === "string" ? zone.speakerKey : "",
    });
  }
  return parsed;
}

function mapOf(value: unknown): MapScreenConfig | null {
  if (!isRecord(value) || !Array.isArray(value.layers)) return null;
  const layers: ZoneLayer[] = [];
  for (const item of value.layers) {
    const layer = layerOf(item);
    if (!layer) return null;
    layers.push(layer);
  }
  const columns = Number(value.columns);
  const rows = Number(value.rows);
  if (!Number.isFinite(columns) || !Number.isFinite(rows)) return null;
  const focusCol = Number(value.focusCol);
  const focusRow = Number(value.focusRow);
  const zoom = Number(value.zoom);
  return {
    layers,
    screenKey: typeof value.screenKey === "string" ? value.screenKey : "",
    speakerKey: typeof value.speakerKey === "string" ? value.speakerKey : "",
    columns,
    rows,
    focusCol: Number.isFinite(focusCol) ? focusCol : 0,
    focusRow: Number.isFinite(focusRow) ? focusRow : 0,
    zoom: Number.isFinite(zoom) ? zoom : 1,
    sceneMode: value.sceneMode === true,
    zonesVisible: value.zonesVisible !== false,
    sceneLabels: sceneLabelsOf(value.sceneLabels),
    sceneCenter: sceneCenterOf(value.sceneCenter),
  };
}

function initiativeOf(value: unknown): InitiativeBoard | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;
  const entries: InitiativeEntry[] = [];
  for (const item of value.entries) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
    const speed = Number(item.speed);
    if (!Number.isFinite(speed)) return null;
    entries.push({
      id: item.id,
      name: item.name,
      speed,
      visible: item.visible !== false,
      ...healthOf(item),
    });
  }
  return {
    entries,
    turnId: typeof value.turnId === "string" ? value.turnId : null,
    barVisible: value.barVisible === true,
  };
}

export function speakerVolumesOf(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const volumes: Record<string, number> = {};
  for (const [key, level] of Object.entries(value)) {
    const number = Number(level);
    if (!key || !Number.isFinite(number)) continue;
    volumes[key] = Math.min(1, Math.max(0, number));
  }
  return volumes;
}

function zoneNumber(value: unknown): ZoneConfig["number"] | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

/** Restore a room layout saved by the server. Invalid payloads are ignored. */
export function parseRoomSession(value: unknown): RoomSession | null {
  if (!isRecord(value)) return null;
  const zones = zonesOf(value.zones);
  const map = mapOf(value.map);
  const initiative = initiativeOf(value.initiative);
  if (!zones || !map || !initiative) return null;
  const activeZone = zoneNumber(value.activeZone) ?? 1;
  const zoneView = value.zoneView === "all" || value.zoneView === "map" ? value.zoneView : zoneNumber(value.zoneView);
  return {
    zones,
    activeZone,
    zoneView: zoneView ?? "all",
    map,
    initiative,
    marks: marksOf(value.marks),
    speakerVolumes: speakerVolumesOf(value.speakerVolumes),
  };
}
