import { useId, useState } from "react";
import type { Network, Station } from "./types";
export function StationField({
  label,
  value,
  set,
  network,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  network?: Network;
}) {
  const uid = useId(),
    [open, show] = useState(false),
    [cursor, select] = useState(-1);
  const matches = (network?.stations ?? [])
    .filter(
      (s) =>
        s.name.includes(value) ||
        s.id.includes(value) ||
        value === "" ||
        value === s.id,
    )
    .slice(0, 16);
  const choose = (s: Station) => {
    set(s.id);
    show(false);
    select(-1);
  };
  return (
    <div className="station-field">
      <label htmlFor={uid}>{label}</label>
      <input
        id={uid}
        role="combobox"
        autoComplete="off"
        value={value}
        placeholder="駅名を入力"
        aria-controls={uid + "list"}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={open && cursor >= 0 ? uid + cursor : undefined}
        onFocus={(e) => {
          e.target.select();
          show(true);
        }}
        onBlur={() => show(false)}
        onChange={(e) => {
          set(e.target.value);
          show(true);
          select(-1);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") show(false);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show(true);
            select(
              Math.max(
                0,
                Math.min(
                  matches.length - 1,
                  cursor + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter" && open && matches[cursor]) {
            e.preventDefault();
            choose(matches[cursor]);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div id={uid + "list"} role="listbox" className="suggestions">
          {matches.map((s, i) => (
            <button
              type="button"
              role="option"
              id={uid + i}
              aria-selected={cursor === i}
              key={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
            >
              <b>{s.name}</b>
              <small>
                {s.prefecture} ·{" "}
                {[
                  ...new Set(
                    network!.lines
                      .filter((l) => l.stops.includes(s.id))
                      .map((l) => l.operator),
                  ),
                ].join("・")}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
