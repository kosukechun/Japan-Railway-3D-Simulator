import type { Journey } from "./types";
import { walk } from "./routing";
export function moment(journey: Journey, minute: number) {
  const steps = journey.steps;
  let index = steps.findIndex((s) => s.arr > minute);
  if (index < 0) index = steps.length - 1;
  const step = steps[index];
  const arrived = minute >= steps.at(-1)!.arr;
  const waiting = minute < step.dep;
  let mapIndex = index;
  if (waiting && index > 0) mapIndex = index - 1;
  while (mapIndex > 0 && steps[mapIndex].line === walk) mapIndex--;
  if (steps[mapIndex].line === walk)
    mapIndex = steps.findIndex((s) => s.line !== walk);
  const motion = steps[mapIndex];
  const t = Math.max(
    0,
    Math.min(
      1,
      (minute - motion.dep) / Math.max(1 / 60, motion.arr - motion.dep),
    ),
  );
  // A short acceleration and braking interval leaves most travel at cruising speed.
  const ramp = 0.12;
  const progress =
    t < ramp
      ? (t * t) / (2 * ramp * (1 - ramp))
      : t > 1 - ramp
        ? 1 - (1 - t) ** 2 / (2 * ramp * (1 - ramp))
        : (t - ramp / 2) / (1 - ramp);
  const state = arrived
    ? "到着"
    : step.line === walk
      ? "徒歩連絡"
      : waiting
        ? index > 0 && steps[index - 1].trip !== step.trip
          ? "乗換待ち"
          : "停車中"
        : "走行中";
  return {
    index,
    mapIndex,
    progress,
    state,
    station: arrived ? step.to : step.from,
  };
}
