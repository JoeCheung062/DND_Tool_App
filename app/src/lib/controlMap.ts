import type { MapFrame } from "./controlPlay";
import { buildPlayAssignments } from "./controlPlay";
import { activeLayers, clearAssignments, nextLayer, parseTarget, placementOf, type ZoneLayer } from "./controlZones";
import { DEFAULT_SCENE_CENTER, defaultSceneLabels, type SceneLabel, type ScenePoint } from "./sceneMode";

export const DEFAULT_GRID = 50;
export const MAP_CELL = 32;

export type MapScreenConfig = {
  layers: ZoneLayer[];
  screenKey: string;
  speakerKey: string;
  columns: number;
  rows: number;
  focusCol: number;
  focusRow: number;
  zoom: number;
  sceneMode: boolean;
  /** Tinted zone shapes on the map. Scene Mode can still turn them back on. */
  zonesVisible: boolean;
  sceneLabels: SceneLabel[];
  /** Red Scene Mode dot. Zone NPC sprites are placed relative to this point. */
  sceneCenter: ScenePoint;
};

export function emptyMapScreen(): MapScreenConfig {
  return {
    layers: [],
    screenKey: "",
    speakerKey: "",
    columns: DEFAULT_GRID,
    rows: DEFAULT_GRID,
    focusCol: 0,
    focusRow: 0,
    zoom: 1,
    sceneMode: false,
    zonesVisible: true,
    sceneLabels: defaultSceneLabels(),
    sceneCenter: DEFAULT_SCENE_CENTER,
  };
}

/** Largest zoom that can enlarge one tile to the short side of a 16:9 frame. */
export function maxMapZoom(columns: number, rows: number) {
  const cols = Math.max(1, columns);
  const rowCount = Math.max(1, rows);
  const fit = Math.min(16 / cols, 9 / rowCount);
  return Math.max(1, 9 / fit);
}

export function clampMapZoom(value: number, columns: number, rows: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(maxMapZoom(columns, rows), Math.max(1, value));
}

export function mapZoomOf(frame: { zoom?: number; columns: number; rows: number }) {
  return clampMapZoom(frame.zoom ?? 1, frame.columns, frame.rows);
}

export function zoomMap(zoom: number, factor: number, columns: number, rows: number) {
  return clampMapZoom(zoom * factor, columns, rows);
}

/** Zoom the map while keeping the cell under the pointer under the pointer. */
export function zoomMapToward(
  frame: MapFrame,
  width: number,
  height: number,
  factor: number,
  pointerX: number,
  pointerY: number
) {
  const camera = mapCamera(frame, width, height);
  const zoom = zoomMap(frame.zoom ?? 1, factor, frame.columns, frame.rows);
  if (camera.cell <= 0 || width <= 0 || height <= 0) {
    return { zoom, focusCol: frame.focusCol, focusRow: frame.focusRow };
  }
  const anchorCol = (pointerX - camera.originX) / camera.cell - 0.5;
  const anchorRow = (pointerY - camera.originY) / camera.cell - 0.5;
  const fitCell = Math.min(width / Math.max(1, frame.columns), height / Math.max(1, frame.rows));
  const nextCell = fitCell * zoom;
  let focusCol = clampFocus(anchorCol + (width / 2 - pointerX) / nextCell, frame.columns);
  let focusRow = clampFocus(anchorRow + (height / 2 - pointerY) / nextCell, frame.rows);
  const shifted = mapCamera({ ...frame, zoom, focusCol, focusRow }, width, height);
  if (shifted.cell > 0) {
    focusCol = clampFocus(focusCol + anchorCol - ((pointerX - shifted.originX) / shifted.cell - 0.5), frame.columns);
    focusRow = clampFocus(focusRow + anchorRow - ((pointerY - shifted.originY) / shifted.cell - 0.5), frame.rows);
  }
  return { zoom, focusCol, focusRow };
}

export function gridCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_GRID;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function clampCell(index: number, count: number) {
  const size = Math.max(1, Math.round(count) || 1);
  if (!Number.isFinite(index)) return 0;
  return Math.min(size - 1, Math.max(0, Math.round(index)));
}

/** Keeps a pan position on the grid without snapping to a whole square. */
export function clampFocus(index: number, count: number) {
  const size = Math.max(1, Math.round(count) || 1);
  if (!Number.isFinite(index)) return 0;
  return Math.min(size - 1, Math.max(0, index));
}

/** Drag the picture by screen pixels. Positive dx moves the map to the right. */
export function panByPixels(
  frame: MapFrame,
  width: number,
  height: number,
  dx: number,
  dy: number
) {
  const cell = mapCamera(frame, width, height).cell;
  const step = cell > 0 ? cell : 1;
  return {
    focusCol: clampFocus(frame.focusCol - dx / step, frame.columns),
    focusRow: clampFocus(frame.focusRow - dy / step, frame.rows),
  };
}

/** Square cells inside the 16:9 display. Zoom enlarges each tile around the highlighted square. */
export function mapCamera(frame: MapFrame, width: number, height: number) {
  const columns = Math.max(1, frame.columns);
  const rows = Math.max(1, frame.rows);
  const zoom = mapZoomOf(frame);
  const fitCell = width > 0 && height > 0 ? Math.min(width / columns, height / rows) : 0;
  const cell = fitCell * zoom;
  const worldWidth = cell * columns;
  const worldHeight = cell * rows;
  let originX = width / 2 - (frame.focusCol + 0.5) * cell;
  let originY = height / 2 - (frame.focusRow + 0.5) * cell;
  if (worldWidth <= width) originX = (width - worldWidth) / 2;
  else originX = Math.min(0, Math.max(width - worldWidth, originX));
  if (worldHeight <= height) originY = (height - worldHeight) / 2;
  else originY = Math.min(0, Math.max(height - worldHeight, originY));
  return { cell, originX, originY, worldWidth, worldHeight, zoom };
}

export function mapFocusRect(frame: MapFrame, width: number, height: number) {
  const camera = mapCamera(frame, width, height);
  return {
    x: camera.originX + frame.focusCol * camera.cell,
    y: camera.originY + frame.focusRow * camera.cell,
    width: camera.cell,
    height: camera.cell,
  };
}

/** Grid lines for the tiles currently inside the display. */
export function mapGridLines(frame: MapFrame, width: number, height: number) {
  const camera = mapCamera(frame, width, height);
  if (camera.cell <= 0 || width <= 0 || height <= 0) return [];
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const onScreen = (position: number, limit: number) => position >= -0.5 && position <= limit + 0.5;
  const top = Math.max(0, camera.originY);
  const bottom = Math.min(height, camera.originY + camera.worldHeight);
  const left = Math.max(0, camera.originX);
  const right = Math.min(width, camera.originX + camera.worldWidth);
  for (let column = 0; column <= frame.columns; column += 1) {
    const x = camera.originX + column * camera.cell;
    if (!onScreen(x, width)) continue;
    lines.push({ x1: x, y1: top, x2: x, y2: bottom });
  }
  for (let row = 0; row <= frame.rows; row += 1) {
    const y = camera.originY + row * camera.cell;
    if (!onScreen(y, height)) continue;
    lines.push({ x1: left, y1: y, x2: right, y2: y });
  }
  return lines;
}

export function mapFrameOf(map: MapScreenConfig): MapFrame {
  const columns = gridCount(map.columns);
  const rows = gridCount(map.rows);
  return {
    columns,
    rows,
    focusCol: clampFocus(map.focusCol, columns),
    focusRow: clampFocus(map.focusRow, rows),
    zoom: clampMapZoom(map.zoom, columns, rows),
  };
}

export function withGridSize(map: MapScreenConfig, columns: number, rows: number): MapScreenConfig {
  const nextColumns = gridCount(columns);
  const nextRows = gridCount(rows);
  return {
    ...map,
    columns: nextColumns,
    rows: nextRows,
    focusCol: clampCell(map.focusCol, nextColumns),
    focusRow: clampCell(map.focusRow, nextRows),
    zoom: clampMapZoom(map.zoom, nextColumns, nextRows),
  };
}

/** Cell under a point inside the map canvas. */
export function cellFromPoint(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
}) {
  const columns = Math.max(1, input.columns);
  const rows = Math.max(1, input.rows);
  const width = input.width > 0 ? input.width : 1;
  const height = input.height > 0 ? input.height : 1;
  return {
    col: clampCell(Math.floor((input.x / width) * columns), columns),
    row: clampCell(Math.floor((input.y / height) * rows), rows),
  };
}

/** Placement of the center of the current 16:9 map view, as fractions from the world center. */
export function viewpointPlacement(map: MapScreenConfig) {
  const frame = mapFrameOf(map);
  const width = 1600;
  const height = 900;
  const camera = mapCamera(frame, width, height);
  if (camera.worldWidth <= 0 || camera.worldHeight <= 0) return { x: 0, y: 0 };
  const worldX = width / 2 - camera.originX;
  const worldY = height / 2 - camera.originY;
  return {
    x: (worldX - camera.worldWidth / 2) / camera.worldWidth,
    y: (worldY - camera.worldHeight / 2) / camera.worldHeight,
  };
}

export function addMapMaterial(map: MapScreenConfig, materialId: string): MapScreenConfig {
  const spot = viewpointPlacement(map);
  const layer = nextLayer(map.layers, materialId, 1);
  return {
    ...map,
    layers: [{ ...layer, x: spot.x, y: spot.y }, ...map.layers],
  };
}

export function assignmentsForMap(map: MapScreenConfig, types: Map<string, string>) {
  const layers = activeLayers(map.layers);
  const ordered = layers.map((layer) => layer.materialId).filter((id) => types.has(id));
  if (ordered.length === 0) {
    const frame = mapFrameOf(map);
    const screen = parseTarget(map.screenKey);
    return clearAssignments(map.screenKey, map.speakerKey).map((assignment) =>
      screen && assignment.clientId === screen.clientId && assignment.screenId === screen.screenId
        ? { ...assignment, map: frame }
        : assignment
    );
  }
  const placements = layers
    .filter((layer) => ordered.includes(layer.materialId))
    .map((layer) => ({
      materialId: layer.materialId,
      instanceId: layer.id,
      ...(layer.useCharacterArt ? { useCharacterArt: true } : {}),
      ...(layer.flip ? { flip: true } : {}),
      ...placementOf(layer),
    }));
  const frame = mapFrameOf(map);
  const screen = parseTarget(map.screenKey);
  const speaker = parseTarget(map.speakerKey);
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
            map: frame,
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
    map: !screen && speaker ? undefined : frame,
  });
}
