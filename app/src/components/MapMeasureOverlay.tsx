import { measureLabel, measureShape, type MapMeasure } from "../lib/mapMeasure";

export function MapMeasureOverlay({
  measure,
  cell,
  width,
  height,
}: {
  measure: MapMeasure;
  cell: number;
  width: number;
  height: number;
}) {
  if (cell <= 0 || width <= 0 || height <= 0) return null;
  const shape = measureShape(measure, cell);
  if (shape.kind === "line" && shape.distance <= 0) return null;
  if (shape.kind === "circle" && shape.radius <= 0) return null;
  if (shape.kind === "square" && shape.size <= 0) return null;
  const label = measureLabel(shape.distance);
  return (
    <svg className="map-measure" viewBox={`0 0 ${width} ${height}`} aria-label={label}>
      {shape.kind === "line" ? (
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
      ) : null}
      {shape.kind === "circle" ? <circle cx={shape.cx} cy={shape.cy} r={shape.radius} /> : null}
      {shape.kind === "square" ? <rect x={shape.x} y={shape.y} width={shape.size} height={shape.size} /> : null}
      <text x={shape.labelX} y={shape.labelY} fontSize={Math.max(14, cell * 0.42)}>
        {label}
      </text>
    </svg>
  );
}
