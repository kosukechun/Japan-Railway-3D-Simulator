import type { TrafficJourney } from "./types";
import { clock } from "./time";
import { Icon } from "./icons";
import { badge } from "./panels";

export function TrafficPanel({
  trains,
  remove,
}: {
  trains: TrafficJourney[];
  remove: (id: string) => void;
}) {
  if (!trains.length) return null;
  return (
    <section className="traffic-panel" aria-label="同時走行の列車">
      <div className="title-row">
        <h2>追加した列車</h2>
        <small>{trains.length} 本</small>
      </div>
      <p>
        選択中の経路と同じ時計で走ります。発車前と到着後は地図から消えます。
      </p>
      {trains.map((t) => (
        <div
          key={t.id}
          className="traffic-entry"
          style={{ borderLeftColor: t.color }}
        >
          <div>
            <strong>{t.label}</strong>
            <small>
              {t.date}　{clock(t.journey.steps[0].dep, true)}発 ·{" "}
              {badge(t.journey)}
            </small>
          </div>
          <button
            className="icon"
            aria-label={t.label + "を同時走行から削除"}
            onClick={() => remove(t.id)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </section>
  );
}
