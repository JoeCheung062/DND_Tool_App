export type MeasureMode = "line" | "circle" | "square";

export type MapMeasure = {
  mode: MeasureMode;
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
};

/** Stroke width in map pixels. The shape path is inset so the outer edge of this stroke sits on the cell edge. */
export const MEASURE_STROKE = 3;

/** Cells between two tiles. A diagonal step counts as one cell. */
export function cellDistance(startCol: number, startRow: number, endCol: number, endRow: number) {
  return Math.max(Math.abs(endCol - startCol), Math.abs(endRow - startRow));
}

/** Distance from the start-cell center to the far edge of the cell under the pointer. */
function outerReach(measure: MapMeasure, cell: number) {
  return (cellDistance(measure.startCol, measure.startRow, measure.endCol, measure.endRow) + 0.5) * cell;
}

export type MeasureShape =
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      distance: number;
      labelX: number;
      labelY: number;
    }
  | {
      kind: "circle";
      cx: number;
      cy: number;
      radius: number;
      distance: number;
      labelX: number;
      labelY: number;
    }
  | {
      kind: "square";
      x: number;
      y: number;
      size: number;
      distance: number;
      labelX: number;
      labelY: number;
    };

/** Pixel geometry for a measurement. Coordinates are map-world pixels. */
export function measureShape(measure: MapMeasure, cell: number): MeasureShape {
  const distance = cellDistance(measure.startCol, measure.startRow, measure.endCol, measure.endRow);
  const x1 = (measure.startCol + 0.5) * cell;
  const y1 = (measure.startRow + 0.5) * cell;
  const x2 = (measure.endCol + 0.5) * cell;
  const y2 = (measure.endRow + 0.5) * cell;
  if (measure.mode === "line") {
    return {
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      distance,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - cell * 0.35,
    };
  }
  const reach = outerReach(measure, cell);
  const inset = MEASURE_STROKE / 2;
  if (measure.mode === "circle") {
    return {
      kind: "circle",
      cx: x1,
      cy: y1,
      radius: Math.max(0, reach - inset),
      distance,
      labelX: x1,
      labelY: y1,
    };
  }
  return {
    kind: "square",
    x: x1 - reach + inset,
    y: y1 - reach + inset,
    size: Math.max(0, (reach - inset) * 2),
    distance,
    labelX: x1,
    labelY: y1,
  };
}

export function measureLabel(distance: number) {
  return String(distance);
}
