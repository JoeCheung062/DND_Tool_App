export type MaterialPlacement = {
  x: number;
  y: number;
  scale: number;
  /** Mirror the picture left to right. */
  flip?: boolean;
};

export const DEFAULT_PLACEMENT: MaterialPlacement = { x: 0, y: 0, scale: 1 };

export type CanvasMaterial = {
  id: string;
  type: string;
  name: string;
  localUrl: string;
  x?: number;
  y?: number;
  scale?: number;
  flip?: boolean;
};

export type CanvasLayer = {
  id: string;
  name: string;
  localUrl: string;
  kind: "image" | "effect" | "sound";
  alpha: number;
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
};

/** One screen entry per id, so two copies of the same material stay separate. */
export function expandPlacedMaterials<T extends { id: string }>(
  ids: string[],
  placements:
    | Array<{
        materialId: string;
        instanceId?: string;
        useCharacterArt?: boolean;
        x?: number;
        y?: number;
        scale?: number;
        flip?: boolean;
      }>
    | undefined,
  library: Map<string, T & { localUrl?: string; characterArtLocalUrl?: string | null }>
): Array<T & { localUrl: string; x: number; y: number; scale: number; flip?: boolean }> {
  return ids.flatMap((id, index) => {
    const saved = library.get(id);
    if (!saved) return [];
    const spot = placements?.[index];
    const matched = spot?.materialId === id ? spot : undefined;
    return [
      {
        ...saved,
        id: matched?.instanceId || `${saved.id}#${index}`,
        localUrl:
          matched?.useCharacterArt && saved.characterArtLocalUrl
            ? saved.characterArtLocalUrl
            : (saved.localUrl ?? ""),
        x: matched?.x ?? 0,
        y: matched?.y ?? 0,
        scale: matched?.scale ?? 1,
        ...(matched?.flip ? { flip: true } : {}),
      },
    ];
  });
}

/**
 * Hold the previous picture only when every visible material is replaced.
 * A deletion or a position change keeps the materials that are still on screen.
 */
export function shouldHoldPreviousScene(previousIds: string[], nextIds: string[]) {
  if (previousIds.length === 0 || nextIds.length === 0) return false;
  const next = new Set(nextIds);
  return previousIds.every((id) => !next.has(id));
}

/** Stack order for one screen. Effects keep the file's own transparency. */
export function layoutCanvasLayers(materials: CanvasMaterial[]): CanvasLayer[] {
  return materials.map((material) => {
    const type = material.type.toUpperCase();
    const placement = normalizePlacement(material);
    const facing = material.flip ? { flip: true as const } : {};
    if (type === "SOUND") {
      return {
        id: material.id,
        name: material.name,
        localUrl: material.localUrl,
        kind: "sound",
        alpha: 0,
        ...placement,
        ...facing,
      };
    }
    if (type === "EFFECT") {
      return {
        id: material.id,
        name: material.name,
        localUrl: material.localUrl,
        kind: "effect",
        alpha: 1,
        ...placement,
        ...facing,
      };
    }
    return {
      id: material.id,
      name: material.name,
      localUrl: material.localUrl,
      kind: "image",
      alpha: 1,
      ...placement,
      ...facing,
    };
  });
}

export function isVideoClip(url: string) {
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url);
}

export function isVideoBytes(bytes: Uint8Array) {
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function isGifBytes(bytes: Uint8Array) {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  );
}

/** A combination click plays its clips once, even if the extra once flag was dropped. */
export function shouldPlayOnce(input: { once?: boolean; combinationId?: string }) {
  return input.once === true || Boolean(input.combinationId);
}

/** Effect clips play once unless the assignment asks them to keep looping. */
export function assignmentPlaysOnce(
  input: { once?: boolean; combinationId?: string },
  materials: Array<{ type?: string }> = []
) {
  if (input.once === false) return false;
  return (
    shouldPlayOnce(input) ||
    materials.some((material) => (material.type ?? "").toUpperCase() === "EFFECT")
  );
}

export function normalizePlacement(input?: Partial<MaterialPlacement> | null): MaterialPlacement {
  const x = Number(input?.x);
  const y = Number(input?.y);
  const scale = Number(input?.scale);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    scale: Number.isFinite(scale) && scale > 0 ? Math.min(8, Math.max(0.005, scale)) : 1,
  };
}

export function zoomPlacement(placement: MaterialPlacement, factor: number) {
  return normalizePlacement({ ...placement, scale: placement.scale * factor });
}

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

/** Scale from the opposite corner so a corner handle zooms without stretching. */
export function placementFromCornerDrag(input: {
  stageWidth: number;
  stageHeight: number;
  anchorX: number;
  anchorY: number;
  pointerX: number;
  pointerY: number;
  originDistance: number;
  originScale: number;
  originWidth: number;
  originHeight: number;
  corner: ResizeCorner;
}) {
  const distance = Math.hypot(input.pointerX - input.anchorX, input.pointerY - input.anchorY);
  const factor = input.originDistance > 0 ? distance / input.originDistance : 1;
  const width = Math.max(8, input.originWidth * factor);
  const height = Math.max(8, input.originHeight * factor);
  const left = input.corner === "ne" || input.corner === "se" ? input.anchorX : input.anchorX - width;
  const top = input.corner === "sw" || input.corner === "se" ? input.anchorY : input.anchorY - height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const stageWidth = input.stageWidth > 0 ? input.stageWidth : 1;
  const stageHeight = input.stageHeight > 0 ? input.stageHeight : 1;
  return normalizePlacement({
    x: (centerX - stageWidth / 2) / stageWidth,
    y: (centerY - stageHeight / 2) / stageHeight,
    scale: input.originScale * (input.originWidth > 0 ? width / input.originWidth : factor),
  });
}

/** Object-fit contain rectangle inside a destination canvas. */
export function containRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  const safeSrcW = srcW > 0 ? srcW : 1;
  const safeSrcH = srcH > 0 ? srcH : 1;
  const scale = Math.min(dstW / safeSrcW, dstH / safeSrcH);
  const width = safeSrcW * scale;
  const height = safeSrcH * scale;
  return {
    x: (dstW - width) / 2,
    y: (dstH - height) / 2,
    width,
    height,
  };
}

/** Fitted size, then moved and scaled. x/y are fractions of the screen from center. */
export function placedRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  placement?: Partial<MaterialPlacement> | null
) {
  const fitted = containRect(srcW, srcH, dstW, dstH);
  const place = normalizePlacement(placement);
  const width = fitted.width * place.scale;
  const height = fitted.height * place.scale;
  const centerX = dstW / 2 + place.x * dstW;
  const centerY = dstH / 2 + place.y * dstH;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
