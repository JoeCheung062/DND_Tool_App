import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  addEntry,
  removeEntry,
  setBarVisible,
  setEntryHealth,
  setEntryHpVisible,
  setEntryVisible,
  sortedEntries,
  stepTurn,
  type InitiativeBoard,
  type InitiativeEntry,
} from "../lib/initiative";

export function InitiativePanel({
  board,
  onChange,
}: {
  board: InitiativeBoard;
  onChange: (next: InitiativeBoard) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = sortedEntries(board.entries);
  const listRef = useRef<HTMLOListElement>(null);
  const popoverRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const current = listRef.current?.querySelector(".on");
    current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [board.turnId, rows.length]);

  useEffect(() => {
    if (!open) return;
    const field = popoverRef.current?.querySelector("input");
    field?.focus();
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || popoverRef.current?.contains(target)) return;
      if ((target as Element).closest?.(".initiative-add")) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <section className="initiative-panel">
      <div className="initiative-head">
        <h2>Initiative</h2>
        <button
          type="button"
          className="btn icon-btn ghost"
          aria-label={board.barVisible ? "Hide bar" : "Show bar"}
          title={board.barVisible ? "Hide bar" : "Show bar"}
          aria-pressed={board.barVisible}
          onClick={() => onChange(setBarVisible(board, !board.barVisible))}
        >
          {board.barVisible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
        <button type="button" className="btn initiative-step" onClick={() => onChange(stepTurn(board, -1))}>
          <ChevronLeft />
          Previous
        </button>
        <button type="button" className="btn initiative-step" onClick={() => onChange(stepTurn(board, 1))}>
          Next
          <ChevronRight />
        </button>
        <div className="initiative-add-wrap">
          <button
            type="button"
            className="btn initiative-add"
            aria-label="Add character"
            title="Add character"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((current) => !current)}
          >
            <PlusIcon />
          </button>
          {open ? (
            <AddInitiativeForm
              formRef={popoverRef}
              onClose={() => setOpen(false)}
              onAdd={(entry) => {
                onChange(addEntry(board, entry));
                setOpen(false);
              }}
            />
          ) : null}
        </div>
      </div>
      {rows.length > 0 ? (
        <ol className="initiative-list" ref={listRef} aria-label="Character initiative">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className={[
                entry.id === board.turnId ? "on" : "",
                entry.visible ? "" : "off",
                "hp",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="initiative-name">{entry.name}</span>
              <span className="initiative-speed">{entry.speed}</span>
              <button
                type="button"
                className="btn icon-btn ghost"
                aria-label={entry.visible ? "Hide" : "Show"}
                title={entry.visible ? "Hide" : "Show"}
                onClick={() => onChange(setEntryVisible(board, entry.id, !entry.visible))}
              >
                {entry.visible ? <EyeIcon /> : <EyeOffIcon />}
              </button>
              <button
                type="button"
                className="btn icon-btn ghost"
                aria-label="Remove"
                title="Remove"
                onClick={() => onChange(removeEntry(board, entry.id))}
              >
                <TrashIcon />
              </button>
              <HealthBar
                entry={entry}
                onHealth={(patch) => onChange(setEntryHealth(board, entry.id, patch))}
                onToggle={() => onChange(setEntryHpVisible(board, entry.id, !entry.hpVisible))}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function AddInitiativeForm({
  formRef,
  onAdd,
  onClose,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  onAdd: (entry: InitiativeEntry) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [speed, setSpeed] = useState("10");
  const [maxHp, setMaxHp] = useState("");
  const [hp, setHp] = useState("");

  return (
    <form
      ref={formRef}
      className="initiative-popover"
      role="dialog"
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        const value = Number(speed);
        if (!trimmed || !Number.isFinite(value)) return;
        onAdd({
          id: `init-${Date.now()}`,
          name: trimmed,
          speed: value,
          visible: true,
          maxHp: maxHp.trim() === "" ? 0 : Number(maxHp),
          hp: hp.trim() === "" ? 0 : Number(hp),
          hpVisible: false,
        });
      }}
    >
      <strong id={titleId}>Add initiative</strong>
      <label>
        Name
        <input value={name} aria-label="Name" onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Speed
        <input
          type="number"
          value={speed}
          aria-label="Speed"
          onChange={(event) => setSpeed(event.target.value)}
        />
      </label>
      <div className="initiative-hp-pair">
        <label>
          HP
          <input
            type="number"
            min={0}
            value={hp}
            aria-label="HP"
            onChange={(event) => setHp(event.target.value)}
          />
        </label>
        <span aria-hidden="true">/</span>
        <label>
          Max HP
          <input
            type="number"
            min={0}
            value={maxHp}
            aria-label="Max HP"
            onChange={(event) => setMaxHp(event.target.value)}
          />
        </label>
      </div>
      <div className="initiative-popover-actions">
        <button type="button" className="btn tiny ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn tiny">
          Add
        </button>
      </div>
    </form>
  );
}

function HealthBar({
  entry,
  onHealth,
  onToggle,
}: {
  entry: InitiativeEntry;
  onHealth: (patch: { maxHp?: number; hp?: number }) => void;
  onToggle: () => void;
}) {
  const ratio = entry.maxHp > 0 ? Math.max(0, Math.min(1, entry.hp / entry.maxHp)) : 0;
  return (
    <div className="initiative-hp">
      <div className="initiative-hp-line">
        <span className="initiative-hp-track" aria-hidden="true">
          <span style={{ width: `${ratio * 100}%` }} />
        </span>
        <button
          type="button"
          className={entry.hpVisible ? "btn icon-btn ghost on" : "btn icon-btn ghost"}
          aria-label={entry.hpVisible ? "Hide health on display" : "Show health on display"}
          title={entry.hpVisible ? "Hide health on display" : "Show health on display"}
          aria-pressed={entry.hpVisible}
          onClick={onToggle}
        >
          {entry.hpVisible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
      <div className="initiative-hp-values">
        <label className="initiative-hp-field">
          HP
          <input
            type="number"
            min={0}
            aria-label="HP"
            value={entry.hp}
            onChange={(event) => onHealth({ hp: Number(event.target.value) })}
          />
        </label>
        <span className="initiative-hp-slash" aria-hidden="true">
          /
        </span>
        <label className="initiative-hp-field">
          Max HP
          <input
            type="number"
            min={0}
            aria-label="Max HP"
            value={entry.maxHp}
            onChange={(event) => onHealth({ maxHp: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-4.1 4.6M6.1 6.7C3.5 8.6 2 12 2 12a18 18 0 0 0 6.2 5.4 10 10 0 0 0 4.3 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
