import { useMemo, useState } from "react";
import type { Combination } from "../lib/api";
import {
  LIBRARY_KINDS,
  libraryKindLabel,
  type LibraryKind,
  type LibraryMaterial,
} from "../lib/controlLibrary";
import { combinationMembers, combinationTags, filterCombinations } from "../lib/controlPlay";
import { AudioPrint } from "./AudioPrint";

type CombinationDeckProps = {
  combinations: Combination[];
  library: LibraryMaterial[];
  activeId: string | null;
  disabled?: boolean;
  onPlay: (combination: Combination) => void;
  onPreview: (combination: Combination) => void;
};

export function CombinationDeck({
  combinations,
  library,
  activeId,
  disabled,
  onPlay,
  onPreview,
}: CombinationDeckProps) {
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [kind, setKind] = useState<LibraryKind | "all">("all");
  const tags = useMemo(() => combinationTags(combinations, library), [combinations, library]);
  const visible = filterCombinations(combinations, library, { query, tagId, kind });

  return (
    <section className="combo-deck" aria-label="Combinations">
      <h2>Combinations</h2>
      <p className="muted">Click a combination to play it once on every screen at the same time.</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or tag"
        aria-label="Search combinations by name or tag"
      />
      <label>
        Tag
        <select value={tagId} onChange={(event) => setTagId(event.target.value)}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <div className="chip-row">
        <button
          type="button"
          className={kind === "all" ? "chip on" : "chip"}
          onClick={() => setKind("all")}
        >
          All
        </button>
        {LIBRARY_KINDS.filter((item) => item !== "sound").map((item) => (
          <button
            key={item}
            type="button"
            className={kind === item ? "chip on" : "chip"}
            onClick={() => setKind(item)}
          >
            {libraryKindLabel(item)}
          </button>
        ))}
      </div>
      <div className="combo-grid">
        {combinations.length === 0 ? (
          <p className="muted">No combinations yet.</p>
        ) : visible.length === 0 ? (
          <p className="muted">No combinations match.</p>
        ) : null}
        {visible.map((combination) => {
          const members = combinationMembers(combination, library);
          return (
            <article
              key={combination.id}
              className={combination.id === activeId ? "combo-card on" : "combo-card"}
            >
              <strong>{combination.name}</strong>
              <AudioPrint
                url={
                  members
                    .filter((member) => member.type.toUpperCase() === "SOUND")
                    .map((member) => library.find((item) => item.id === member.id)?.localUrl)
                    .find(Boolean)
                }
              />
              <span>
                {members
                  .map((member) => member.name)
                  .filter(Boolean)
                  .join(" · ") || "No materials"}
              </span>
              <div className="combo-card-actions">
                <button
                  type="button"
                  className="btn tiny"
                  disabled={disabled}
                  onClick={() => onPlay(combination)}
                >
                  Play
                </button>
                <button type="button" className="btn tiny ghost" onClick={() => onPreview(combination)}>
                  Preview
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
