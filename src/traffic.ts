import type { Journey, TrafficJourney } from "./types";
import { midnight } from "./time";
import { moment } from "./playback";
import { walk } from "./routing";

export function journeyKey(journey: Journey, date: string) {
  return JSON.stringify([
    date,
    journey.steps.map((s) => [s.from, s.to, s.trip, s.dep, s.arr]),
  ]);
}

export function trafficPosition(train: TrafficJourney, timeMs: number) {
  const minute = (timeMs - midnight(train.date)) / 60000;
  const first = train.journey.steps[0],
    last = train.journey.steps.at(-1)!;
  if (minute < first.dep || minute > last.arr) return;
  const current = moment(train.journey, minute);
  const legIndex =
    train.journey.steps
      .slice(0, current.mapIndex + 1)
      .filter((s) => s.line !== walk).length - 1;
  if (legIndex < 0) return;
  return { legIndex, progress: current.progress, state: current.state };
}

export function playbackBounds(
  main: Journey | undefined,
  date: string,
  traffic: TrafficJourney[],
) {
  const journeys = [...(main ? [{ journey: main, date }] : []), ...traffic];
  if (!journeys.length) return;
  const offset = midnight(date);
  const times = journeys.map((t) => ({
    start: (midnight(t.date) - offset) / 60000 + t.journey.steps[0].dep,
    end: (midnight(t.date) - offset) / 60000 + t.journey.steps.at(-1)!.arr,
  }));
  return {
    start: Math.min(...times.map((t) => t.start)),
    end: Math.max(...times.map((t) => t.end)),
  };
}
