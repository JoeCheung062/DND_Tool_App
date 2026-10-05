import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MapMeasureOverlay } from "./MapMeasureOverlay";
import { ZonePreview } from "./ZonePreview";
import { normalizePlacement, zoomPlacement, type MaterialPlacement } from "../lib/canvasLayers";
import {
  gridCount,
  mapCamera,
  mapFrameOf,
  mapZoomOf,
  maxMapZoom,
  panByPixels,
  zoomMapToward,
  type MapScreenConfig,
} from "../lib/controlMap";
import { type MapMeasure, type MeasureMode } from "../lib/mapMeasure";
import {
  moveSceneCorner,
  moveSceneLabel,
  SCENE_ZONE_COLOR,
  snapScenePoint,
  zoneHeading,
  type SceneLabel,
  type ScenePoint,
} from "../lib/sceneMode";

function skipMapMenu(target: EventTarget | null) {
  return Boolean(
    (target as HTMLElement | null)?.closest(
      ".zone-material, .map-chrome, .map-zoom-slider, .zone-handle, .scene-label, .scene-center, .mark-menu"
    )
  );
}

type MapMaterial = {
  id: string;
  name: string;
  type: string;
  localUrl: string;
  placement?: Partial<MaterialPlacement>;
  markText?: string;
  markColor?: string;
};

export function MapCanvas({
  map,
  materials,
  selectedId,
  onSelect,
  onPlacement,
  onFocus,
  onGridSize,
  onZoom,
  onZoomLevel,
  onDropMaterial,
  onOpenMark,
  onOpenMenu,
  onSceneLabels,
  onSceneCenter,
  onMeasure,
  measureArm = null,
  onMeasureArm,
}: {
  map: MapScreenConfig;
  materials: MapMaterial[];
  selectedId?: string | null;
  onSelect?: (materialId: string | null) => void;
  onPlacement?: (materialId: string, placement: MaterialPlacement) => void;
  onFocus: (col: number, row: number) => void;
  onGridSize: (columns: number, rows: number) => void;
  onZoom: (next: { zoom: number; focusCol: number; focusRow: number }) => void;
  onZoomLevel: (zoom: number) => void;
  onDropMaterial?: (materialId: string) => void;
  onOpenMark?: (layerId: string, x: number, y: number) => void;
  onOpenMenu?: (x: number, y: number) => void;
  onSceneLabels: (labels: SceneLabel[]) => void;
  onSceneCenter: (center: ScenePoint) => void;
  onMeasure: (measure: MapMeasure | null) => void;
  measureArm?: MeasureMode | null;
  onMeasureArm?: (mode: MeasureMode | null) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [panning, setPanning] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode | null>(null);
  const [liveMeasure, setLiveMeasure] = useState<MapMeasure | null>(null);
  const measureDrag = useRef<{ pointerId: number } | null>(null);
  const liveMeasureRef = useRef<MapMeasure | null>(null);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    focusCol: number;
    focusRow: number;
  } | null>(null);
  const frame = mapFrameOf(map);
  const frameStateRef = useRef(frame);
  frameStateRef.current = frame;
  const camera = mapCamera(frame, box.width, box.height);
  const zoom = mapZoomOf(frame);
  const zoomLimit = maxMapZoom(frame.columns, frame.rows);
  const onZoomRef = useRef(onZoom);
  const onPlacementRef = useRef(onPlacement);
  const selectedIdRef = useRef(selectedId);
  const materialsRef = useRef(materials);
  onZoomRef.current = onZoom;
  onPlacementRef.current = onPlacement;
  selectedIdRef.current = selectedId;
  materialsRef.current = materials;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const selected = selectedIdRef.current;
      if (selected) {
        const material = materialsRef.current.find((item) => item.id === selected);
        const place = onPlacementRef.current;
        if (!material || !place) return;
        event.preventDefault();
        event.stopPropagation();
        place(material.id, zoomPlacement(normalizePlacement(material.placement), factor));
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = node.getBoundingClientRect();
      onZoomRef.current(
        zoomMapToward(
          frameStateRef.current,
          rect.width,
          rect.height,
          factor,
          event.clientX - rect.left,
          event.clientY - rect.top
        )
      );
    };
    node.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel, { capture: true });
    };
  }, []);

  function cellAt(event: { clientX: number; clientY: number }) {
    const stage = stageRef.current;
    if (!stage || camera.cell <= 0) return null;
    const rect = stage.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / camera.cell);
    const row = Math.floor((event.clientY - rect.top) / camera.cell);
    if (col < 0 || row < 0 || col >= frame.columns || row >= frame.rows) return null;
    return { col, row };
  }

  function publishMeasure(next: MapMeasure) {
    const current = liveMeasureRef.current;
    if (
      current &&
      current.mode === next.mode &&
      current.startCol === next.startCol &&
      current.startRow === next.startRow &&
      current.endCol === next.endCol &&
      current.endRow === next.endRow
    ) {
      return;
    }
    liveMeasureRef.current = next;
    setLiveMeasure(next);
    onMeasure(next);
  }

  function clearMeasure() {
    if (!liveMeasureRef.current) return;
    liveMeasureRef.current = null;
    setLiveMeasure(null);
    onMeasure(null);
  }

  function armMeasure(mode: MeasureMode | null) {
    setMeasureMode(mode);
    onMeasureArm?.(mode);
  }

  useEffect(() => {
    if (measureArm == null) return;
    setMeasureMode(measureArm);
  }, [measureArm]);

  function updateMeasure(event: { clientX: number; clientY: number }, pointerId: number) {
    const drag = measureDrag.current;
    if (!drag || drag.pointerId !== pointerId || !liveMeasureRef.current) return false;
    const cell = cellAt(event);
    if (!cell) return true;
    publishMeasure({ ...liveMeasureRef.current, endCol: cell.col, endRow: cell.row });
    return true;
  }

  function panTo(event: ReactPointerEvent<HTMLElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const next = panByPixels(
      { ...frame, focusCol: pan.focusCol, focusRow: pan.focusRow },
      box.width,
      box.height,
      event.clientX - pan.x,
      event.clientY - pan.y
    );
    onFocus(next.focusCol, next.focusRow);
  }

  return (
    <div className="map-editor">
      <div className="map-frame-slot">
      <div
        ref={frameRef}
        className={panning ? "map-output panning" : "map-output"}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const payload = event.dataTransfer.getData("text/plain");
          if (payload.startsWith("material:")) onDropMaterial?.(payload.slice("material:".length));
        }}
        onContextMenu={(event) => {
          if (skipMapMenu(event.target)) return;
          event.preventDefault();
          onOpenMenu?.(event.clientX, event.clientY);
        }}
        onDoubleClick={(event) => {
          if (measureMode || skipMapMenu(event.target)) return;
          event.preventDefault();
          onOpenMenu?.(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest(".map-chrome, .map-zoom-slider, .zone-handle, .scene-label, .scene-center, .mark-menu")) {
            return;
          }
          if (measureMode) {
            const cell = cellAt(event);
            if (!cell) return;
            const next: MapMeasure = {
              mode: measureMode,
              startCol: cell.col,
              startRow: cell.row,
              endCol: cell.col,
              endRow: cell.row,
            };
            measureDrag.current = { pointerId: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
            publishMeasure(next);
            return;
          }
          const material = target.closest(".zone-material");
          if (material && selectedId && material.getAttribute("data-material-id") === selectedId) return;
          panRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            focusCol: frame.focusCol,
            focusRow: frame.focusRow,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={(event) => {
          if (updateMeasure(event, event.pointerId)) return;
          panTo(event);
        }}
        onPointerUp={(event) => {
          if (measureDrag.current?.pointerId === event.pointerId) {
            measureDrag.current = null;
            armMeasure(null);
            clearMeasure();
            return;
          }
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          const moved = Math.hypot(event.clientX - pan.x, event.clientY - pan.y);
          panRef.current = null;
          setPanning(false);
          if (moved > 6) return;
          const hit = document.elementFromPoint(event.clientX, event.clientY);
          const materialId = hit?.closest?.("[data-material-id]")?.getAttribute("data-material-id");
          if (!materialId) return;
          onSelect?.(materialId === selectedId ? null : materialId);
        }}
        onPointerCancel={() => {
          panRef.current = null;
          if (measureDrag.current) {
            armMeasure(null);
            clearMeasure();
          }
          measureDrag.current = null;
          setPanning(false);
        }}
      >
        <div className={gridOpen ? "map-chrome open" : "map-chrome"}>
          <button
            type="button"
            className="map-chrome-toggle"
            aria-expanded={gridOpen}
            aria-label={gridOpen ? "Hide grid size" : "Show grid size"}
            onClick={() => setGridOpen((open) => !open)}
          >
            {gridOpen ? <ChevronUp /> : <ChevronDown />}
          </button>
          {gridOpen ? (
            <>
              <label>
                Columns
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={frame.columns}
                  onChange={(event) => onGridSize(gridCount(Number(event.target.value)), frame.rows)}
                />
              </label>
              <label>
                Rows
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={frame.rows}
                  onChange={(event) => onGridSize(frame.columns, gridCount(Number(event.target.value)))}
                />
              </label>
              <span>{Math.round(zoom * 100)}%</span>
            </>
          ) : null}
        </div>
        <label className="map-zoom-slider">
          Zoom
          <span className="map-zoom-range">
            <input
              type="range"
              min={1}
              max={zoomLimit}
              step={0.05}
              value={zoom}
              aria-label="Map zoom"
              style={rangeFill(zoom, 1, zoomLimit)}
              onChange={(event) => onZoomLevel(Number(event.target.value))}
            />
          </span>
        </label>
        {camera.cell > 0 ? (
          <div
            ref={stageRef}
            className="map-stage"
            style={{
              left: camera.originX,
              top: camera.originY,
              width: camera.worldWidth,
              height: camera.worldHeight,
            }}
          >
            <ZonePreview
              materials={materials}
              selectedId={selectedId}
              onSelect={onSelect}
              onPlacement={onPlacement}
              onOpenMark={onOpenMark}
              selectOnRelease
            />
            <svg className="map-grid" width={camera.worldWidth} height={camera.worldHeight} aria-hidden="true">
              {Array.from({ length: frame.columns + 1 }, (_, column) => (
                <line
                  key={`col-${column}`}
                  x1={column * camera.cell}
                  y1={0}
                  x2={column * camera.cell}
                  y2={camera.worldHeight}
                />
              ))}
              {Array.from({ length: frame.rows + 1 }, (_, row) => (
                <line
                  key={`row-${row}`}
                  x1={0}
                  y1={row * camera.cell}
                  x2={camera.worldWidth}
                  y2={row * camera.cell}
                />
              ))}
            </svg>
            {map.zonesVisible ? (
              <SceneLabelLayer
                labels={map.sceneLabels}
                center={map.sceneCenter}
                width={camera.worldWidth}
                height={camera.worldHeight}
                columns={frame.columns}
                rows={frame.rows}
                locked={!map.sceneMode}
                onChange={onSceneLabels}
                onCenter={onSceneCenter}
              />
            ) : null}
          </div>
        ) : null}
        {liveMeasure && camera.cell > 0 ? (
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
              measure={liveMeasure}
              cell={camera.cell}
              width={camera.worldWidth}
              height={camera.worldHeight}
            />
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function SceneLabelLayer({
  labels,
  center,
  width,
  height,
  columns,
  rows,
  locked,
  onChange,
  onCenter,
}: {
  labels: SceneLabel[];
  center: ScenePoint;
  width: number;
  height: number;
  columns: number;
  rows: number;
  locked: boolean;
  onChange: (labels: SceneLabel[]) => void;
  onCenter: (center: ScenePoint) => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    zone: SceneLabel["zone"];
    mode: "move" | "corner" | "center";
    corner: number;
    start: ScenePoint;
    origin: SceneLabel[];
  } | null>(null);

  function worldPoint(event: ReactPointerEvent<SVGElement>): ScenePoint {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    const bounds = rect ?? { left: 0, top: 0, width: width || 1, height: height || 1 };
    return {
      x: (event.clientX - bounds.left) / (bounds.width || 1),
      y: (event.clientY - bounds.top) / (bounds.height || 1),
    };
  }

  function begin(
    event: ReactPointerEvent<SVGElement>,
    zone: SceneLabel["zone"],
    mode: "move" | "corner" | "center",
    corner = 0
  ) {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      zone,
      mode,
      corner,
      start: worldPoint(event),
      origin: labels,
    };
  }

  function move(event: ReactPointerEvent<SVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = worldPoint(event);
    if (drag.mode === "center") {
      onCenter({
        x: Math.min(1, Math.max(0, point.x)),
        y: Math.min(1, Math.max(0, point.y)),
      });
      return;
    }
    const source = drag.origin.find((label) => label.zone === drag.zone);
    if (!source) return;
    const next =
      drag.mode === "move"
        ? moveSceneLabel(source, point.x - drag.start.x, point.y - drag.start.y)
        : moveSceneCorner(source, drag.corner, snapScenePoint(point, columns, rows));
    onChange(drag.origin.map((label) => (label.zone === drag.zone ? next : label)));
  }

  function end(event: ReactPointerEvent<SVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  }

  return (
    <svg
      className={locked ? "scene-labels cue" : "scene-labels"}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={locked ? "Zone guides" : "Scene mode zones"}
    >
      {labels.map((label) => {
        const color = SCENE_ZONE_COLOR[label.zone];
        const points = label.corners.map((corner) => `${corner.x * width},${corner.y * height}`).join(" ");
        const center = label.corners.reduce(
          (sum, corner) => ({ x: sum.x + corner.x / 4, y: sum.y + corner.y / 4 }),
          { x: 0, y: 0 }
        );
        return (
          <g key={label.zone} className="scene-label">
            <polygon
              points={points}
              fill={color}
              fillOpacity={locked ? 0.12 : 0.28}
              stroke={color}
              strokeOpacity={locked ? 0.45 : 1}
              strokeWidth={2}
              onPointerDown={locked ? undefined : (event) => begin(event, label.zone, "move")}
              onPointerMove={locked ? undefined : move}
              onPointerUp={locked ? undefined : end}
            />
            <text x={center.x * width} y={center.y * height} fill={color} textAnchor="middle" dominantBaseline="middle">
              {zoneHeading(label.zone)}
            </text>
            {locked
              ? null
              : label.corners.map((corner, index) => (
              <circle
                key={index}
                cx={corner.x * width}
                cy={corner.y * height}
                r={8}
                fill={color}
                stroke="#061018"
                strokeWidth={2}
                onPointerDown={(event) => begin(event, label.zone, "corner", index)}
                onPointerMove={move}
                onPointerUp={end}
              />
            ))}
          </g>
        );
      })}
      <circle
        className="scene-center"
        cx={center.x * width}
        cy={center.y * height}
        r={locked ? 8 : 11}
        fill="#ff3b30"
        fillOpacity={locked ? 0.45 : 1}
        stroke="#061018"
        strokeWidth={2}
        strokeOpacity={locked ? 0.35 : 1}
        aria-label="Scene center"
        onPointerDown={locked ? undefined : (event) => begin(event, 1, "center")}
        onPointerMove={locked ? undefined : move}
        onPointerUp={locked ? undefined : end}
      >
        <title>Center</title>
      </circle>
    </svg>
  );
}

function rangeFill(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  return { "--fill": `${pct}%` } as CSSProperties;
}

function ChevronUp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 14.5 12 8.5l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9.5 12 15.5l6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
