export type InitiativeEntry = {
  id: string;
  name: string;
  speed: number;
  visible: boolean;
  maxHp: number;
  hp: number;
  /** When true, Display Mode shows this character's health. Control Mode always shows it. */
  hpVisible: boolean;
};

export type InitiativeBoard = {
  entries: InitiativeEntry[];
  turnId: string | null;
  barVisible: boolean;
};

export function emptyInitiative(): InitiativeBoard {
  return { entries: [], turnId: null, barVisible: false };
}

/** Highest speed first. Equal speeds keep the order they were added. */
export function sortedEntries(entries: InitiativeEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.speed - a.entry.speed || a.index - b.index)
    .map((item) => item.entry);
}

export function visibleEntries(board: InitiativeBoard) {
  return sortedEntries(board.entries).filter((entry) => entry.visible);
}

function normalizeTurn(board: InitiativeBoard): InitiativeBoard {
  const visible = visibleEntries(board);
  if (visible.some((entry) => entry.id === board.turnId)) return board;
  return { ...board, turnId: visible[0]?.id ?? null };
}

function finiteHp(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(9999, Math.round(number));
}

export function healthOf(entry: { maxHp?: unknown; hp?: unknown; hpVisible?: unknown }) {
  const maxHp = finiteHp(entry.maxHp);
  const hp = maxHp > 0 ? Math.min(finiteHp(entry.hp), maxHp) : 0;
  return { maxHp, hp, hpVisible: entry.hpVisible === true };
}

export function addEntry(board: InitiativeBoard, entry: InitiativeEntry): InitiativeBoard {
  const name = entry.name.trim();
  if (!name || !Number.isFinite(entry.speed)) return board;
  return normalizeTurn({
    ...board,
    entries: [
      ...board.entries,
      {
        id: entry.id,
        name,
        speed: entry.speed,
        visible: entry.visible !== false,
        ...healthOf(entry),
      },
    ],
  });
}

export function removeEntry(board: InitiativeBoard, id: string): InitiativeBoard {
  return normalizeTurn({
    ...board,
    entries: board.entries.filter((entry) => entry.id !== id),
  });
}

export function setEntryVisible(board: InitiativeBoard, id: string, visible: boolean): InitiativeBoard {
  return normalizeTurn({
    ...board,
    entries: board.entries.map((entry) => (entry.id === id ? { ...entry, visible } : entry)),
  });
}

export function setEntryHpVisible(board: InitiativeBoard, id: string, hpVisible: boolean): InitiativeBoard {
  return {
    ...board,
    entries: board.entries.map((entry) => (entry.id === id ? { ...entry, hpVisible } : entry)),
  };
}

export function setEntryHealth(
  board: InitiativeBoard,
  id: string,
  patch: { maxHp?: number; hp?: number }
): InitiativeBoard {
  return {
    ...board,
    entries: board.entries.map((entry) => {
      if (entry.id !== id) return entry;
      const maxHp = patch.maxHp === undefined ? entry.maxHp : finiteHp(patch.maxHp);
      const hp = Math.min(patch.hp === undefined ? entry.hp : finiteHp(patch.hp), maxHp);
      return { ...entry, maxHp, hp };
    }),
  };
}

export function setBarVisible(board: InitiativeBoard, barVisible: boolean): InitiativeBoard {
  return { ...board, barVisible };
}

/** Move the highlight among visible entries. Hidden players are skipped. */
export function stepTurn(board: InitiativeBoard, direction: 1 | -1): InitiativeBoard {
  const visible = visibleEntries(board);
  if (visible.length === 0) return { ...board, turnId: null };
  const index = visible.findIndex((entry) => entry.id === board.turnId);
  const start = index < 0 ? 0 : index;
  const next = (start + direction + visible.length) % visible.length;
  return { ...board, turnId: visible[next].id };
}
