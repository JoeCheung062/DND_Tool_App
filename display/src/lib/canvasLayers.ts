export type CanvasMaterial = {
  id: string;
  type: string;
  name: string;
  localUrl: string;
};

export type CanvasLayer = {
  id: string;
  name: string;
  localUrl: string;
  kind: "image" | "effect" | "sound";
  alpha: number;
};

/** Stack order for one screen: images opaque, effects translucent, sounds separate. */
export function layoutCanvasLayers(materials: CanvasMaterial[]): CanvasLayer[] {
  return materials.map((material) => {
    const type = material.type.toUpperCase();
    if (type === "SOUND") {
      return {
        id: material.id,
        name: material.name,
        localUrl: material.localUrl,
        kind: "sound",
        alpha: 0,
      };
    }
    if (type === "EFFECT") {
      return {
        id: material.id,
        name: material.name,
        localUrl: material.localUrl,
        kind: "effect",
        alpha: 0.65,
      };
    }
    return {
      id: material.id,
      name: material.name,
      localUrl: material.localUrl,
      kind: "image",
      alpha: 1,
    };
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
