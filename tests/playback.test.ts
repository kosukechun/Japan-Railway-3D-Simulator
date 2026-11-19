import { describe, expect, it } from "vitest";
import { moment } from "../src/playback";
import { journeyKey, playbackBounds, trafficPosition } from "../src/traffic";
import { lightHeight, solarElevation, track, sample } from "../src/map-math";
import { midnight } from "../src/time";
import type { Journey, TrafficJourney } from "../src/types";

const journey: Journey = {
  changes: 1,
  km: 20,
  steps: [
    {
      from: "A",
      to: "B",
      dep: 540,
      arr: 550,
      line: "a",
      trip: "first",
      source: "simulation",
      destination: "B",
    },
    {
      from: "B",
      to: "C",
      dep: 555,
      arr: 570,
      line: "b",
      trip: "second",
      source: "simulation",
      destination: "C",
    },
  ],
};
const train: TrafficJourney = {
  id: "1",
  label: "A → C",
  color: "#ffaa55",
  journey,
  date: "2026-11-20",
};
describe("共通時刻による複数列車再生", () => {
  it("乗換中は到着駅で停止し、次の列車の発車から走行する", () => {
    expect(moment(journey, 552)).toMatchObject({
      mapIndex: 0,
      progress: 1,
      state: "乗換待ち",
    });
    expect(moment(journey, 556)).toMatchObject({
      mapIndex: 1,
      state: "走行中",
    });
    expect(moment(journey, 580)).toMatchObject({ progress: 1, state: "到着" });
  });
  it("別日を含む全列車の発着をタイムラインに含める", () => {
    expect(
      playbackBounds(journey, train.date, [{ ...train, date: "2026-11-21" }]),
    ).toEqual({ start: 540, end: 2010 });
  });
  it("発車前・到着後を非表示にし、シークで位置を再計算する", () => {
    expect(
      trafficPosition(train, midnight(train.date) + 539 * 60000),
    ).toBeUndefined();
    expect(
      trafficPosition(train, midnight(train.date) + 571 * 60000),
    ).toBeUndefined();
    expect(
      trafficPosition(train, midnight(train.date) + 545 * 60000)?.progress,
    ).toBeCloseTo(0.5);
    expect(
      trafficPosition(train, midnight(train.date) + 565 * 60000)?.legIndex,
    ).toBe(1);
  });
  it("逆向きや異なる便を同じ列車として扱わない", () => {
    expect(journeyKey(journey, train.date)).not.toBe(
      journeyKey(journey, "2026-11-21"),
    );
    const other = {
      ...journey,
      steps: journey.steps.map((s) => ({ ...s, trip: "another" })),
    };
    expect(journeyKey(journey, train.date)).not.toBe(
      journeyKey(other, train.date),
    );
  });
});
describe("地理と季節の光", () => {
  it("線形の中点は元の区間の上にある", () => {
    const t = track({
      coords: [
        [135, 35],
        [135.1, 35],
        [135.1, 35.1],
      ],
      from: "A",
      to: "B",
      line: "a",
      kind: "jr",
    });
    const p = sample(t, t.distances[1]);
    expect(p.x).toBeCloseTo(135.1, 6);
    expect(p.y).toBeCloseTo(35, 6);
  });
  it("大阪の昼夜と夏冬の日没差を反映する", () => {
    const elevation = (date: string, time: string) =>
      solarElevation(Date.parse(date + "T" + time + ":00+09:00"), 135.5, 34.7);
    expect(elevation("2026-11-20", "12:00")).toBeGreaterThan(25);
    expect(elevation("2026-11-20", "23:00")).toBeLessThan(-30);
    expect(elevation("2026-06-21", "18:00")).toBeGreaterThan(0);
    expect(elevation("2026-12-21", "18:00")).toBeLessThan(0);
    expect(lightHeight("night", 0, 135.5, 34.7)).toBeLessThan(0);
  });
});
