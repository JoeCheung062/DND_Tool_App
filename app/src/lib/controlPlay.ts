import { libraryKind, matchesLibraryQuery, type LibraryKind, type LibraryMaterial } from "./controlLibrary";

export type PlayTarget = {
  clientId: string;
  screenId: number;
};

export type MaterialPlacementPayload = {
  materialId: string;
  /** Stable layer id so a later update can move this copy without remounting it. */
  instanceId?: string;
  /** Zone copy of an NPC uses Character Art instead of the map Avatar. */
  useCharacterArt?: boolean;
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
};

export type MapFrame = {
  columns: number;
  rows: number;
  focusCol: number;
  focusRow: number;
  /** 1 shows the whole map. Larger values enlarge each tile. */
  zoom?: number;
};

/** Build Socket.IO assignments that target specific display clients and screens. */
export function buildPlayAssignments(input: {
  screens: PlayTarget[];
  materialIds: string[];
  combinationId?: string;
  once?: boolean;
  placements?: MaterialPlacementPayload[];
  map?: MapFrame;
}) {
  const content = {
    materialIds: input.materialIds,
    ...(input.combinationId ? { combinationId: input.combinationId } : {}),
    ...(input.once === true ? { once: true as const } : {}),
    ...(input.once === false ? { once: false as const } : {}),
    ...(input.placements && input.placements.length > 0 ? { placements: input.placements } : {}),
    ...(input.map ? { map: input.map } : {}),
  };
  return input.screens.map((screen) => ({
    screenId: screen.screenId,
    clientId: screen.clientId,
    ...content,
  }));
}

export function combinationMaterialIds(combination: {
  mainMaterialId?: string | null;
  connectMaterialList?: Array<{ id: string }>;
}) {
  return [
    ...(combination.mainMaterialId ? [combination.mainMaterialId] : []),
    ...(combination.connectMaterialList ?? []).map((material) => material.id),
  ];
}

export type CombinationSource = {
  id: string;
  name: string;
  mainMaterialId?: string | null;
  mainMaterial?: { id: string; name: string; type: string };
  connectMaterialList?: Array<{ id: string; name: string; type: string }>;
};

/** Materials in a combination, with tags filled in from the downloaded library. */
export function combinationMembers(combination: CombinationSource, library: LibraryMaterial[]) {
  const byId = new Map(library.map((item) => [item.id, item]));
  return combinationMaterialIds(combination).map((id) => {
    const local = byId.get(id);
    const remote =
      combination.mainMaterial?.id === id
        ? combination.mainMaterial
        : combination.connectMaterialList?.find((item) => item.id === id);
    return {
      id,
      name: local?.name ?? remote?.name ?? "",
      type: local?.type ?? remote?.type ?? "",
      tags: local?.tags ?? [],
      general: local?.general,
    };
  });
}

export function combinationTags(combinations: CombinationSource[], library: LibraryMaterial[]) {
  const map = new Map<string, string>();
  for (const combination of combinations) {
    for (const member of combinationMembers(combination, library)) {
      for (const tag of member.tags) map.set(tag.id, tag.name);
    }
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export function filterCombinations<T extends CombinationSource>(
  combinations: T[],
  library: LibraryMaterial[],
  options: { query: string; tagId?: string; kind?: LibraryKind | "all" }
) {
  const kind = options.kind ?? "all";
  const needle = options.query.trim().toLowerCase();
  return combinations.filter((combination) => {
    const members = combinationMembers(combination, library);
    if (options.tagId && !members.some((member) => member.tags.some((tag) => tag.id === options.tagId))) {
      return false;
    }
    if (kind !== "all" && !members.some((member) => libraryKind(member) === kind)) return false;
    if (!needle) return true;
    if (combination.name.toLowerCase().includes(needle)) return true;
    return members.some((member) => matchesLibraryQuery(member, needle));
  });
}
