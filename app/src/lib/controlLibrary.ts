export type LibraryKind = "image" | "animation" | "sound" | "model";
export type SoundGroup = "bgm" | "effect" | "general";

export type LibraryMaterial = {
  id: string;
  name: string;
  type: string;
  general?: boolean;
  tags: Array<{ id: string; name: string }>;
  localUrl?: string;
};

const LIBRARY_LABEL: Record<LibraryKind, string> = {
  image: "Images",
  animation: "Animations",
  sound: "Sounds",
  model: "Models",
};

export const LIBRARY_KINDS: LibraryKind[] = ["image", "animation", "sound", "model"];

export function libraryKindLabel(kind: LibraryKind) {
  return LIBRARY_LABEL[kind];
}

function tagNames(material: LibraryMaterial) {
  return material.tags.map((tag) => tag.name.toLowerCase());
}

/** Group a downloaded material into the asset library sections. */
export function libraryKind(material: LibraryMaterial): LibraryKind {
  const tags = tagNames(material);
  const name = material.name.toLowerCase();
  if (tags.some((tag) => tag.includes("model")) || name.includes("model")) return "model";
  if (material.type.toUpperCase() === "SOUND") return "sound";
  if (tags.some((tag) => tag.includes("anim")) || name.includes("anim")) return "animation";
  if (material.type.toUpperCase() === "EFFECT") return "animation";
  return "image";
}

/** BGM wins over the General flag, so a shared track tagged “bgm” stays BGM. */
export function soundGroup(material: LibraryMaterial): SoundGroup {
  const tags = tagNames(material);
  const name = material.name.toLowerCase();
  if (
    tags.some((tag) => tag === "bgm" || tag.includes("music") || tag.includes("bgm")) ||
    name.includes("bgm")
  ) {
    return "bgm";
  }
  if (
    material.general ||
    tags.some((tag) => tag === "general" || tag.includes("general"))
  ) {
    return "general";
  }
  return "effect";
}

/** Sounds are played from the sound deck, not placed on the canvas. */
export function belongsInAssetLibrary(material: LibraryMaterial) {
  return material.type.toUpperCase() !== "SOUND";
}

export function soundGroupLabel(group: SoundGroup) {
  if (group === "bgm") return "BGM";
  if (group === "general") return "General Sound Effects";
  return "Effect Sounds";
}

export function matchesLibraryQuery(material: LibraryMaterial, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [material.name, ...material.tags.map((tag) => tag.name)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
