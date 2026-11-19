import type { Line, Network, Query, Timetable, Journey } from "./types";
import type { MapLeg } from "./map";
import { walk } from "./routing";
import { dateJST } from "./time";

const base = new URL("./data/", document.baseURI);
async function read<T>(path: string): Promise<T> {
  const res = await fetch(new URL(path, base));
  if (!res.ok)
    throw new Error(
      "鉄道データを取得できませんでした（" +
        path +
        "、HTTP " +
        res.status +
        "）。",
    );
  return res.json();
}
export async function loadData() {
  const [a, b, table] = await Promise.all([
    read<Network>("network.json"),
    read<Network>("okayama-network.json"),
    read<Timetable>("timetable.json"),
  ]);
  return {
    network: {
      stations: [...a.stations, ...b.stations],
      lines: [...a.lines, ...b.lines],
    },
    table,
  };
}
type Coords = [number, number][];
const shapes = new Map<string, Promise<Record<string, Coords>>>();
function geometry(line: Line) {
  let data = shapes.get(line.id);
  if (!data) {
    data = read<Record<string, Coords>>("shapes/" + line.id + ".json").catch(
      (e) => {
        shapes.delete(line.id);
        throw e;
      },
    );
    shapes.set(line.id, data);
  }
  return data;
}
export async function mapLegs(
  journey: Journey,
  lines: Map<string, Line>,
): Promise<MapLeg[]> {
  const steps = journey.steps.filter((s) => s.line !== walk);
  return Promise.all(
    steps.map(async (s, i) => {
      const line = lines.get(s.line)!,
        a = line.stops.indexOf(s.from),
        b = line.stops.indexOf(s.to);
      if (a < 0 || b < 0 || a === b)
        throw new Error("停車駅と路線形状が一致しません。");
      const data = await geometry(line),
        coords: Coords = [];
      for (const key of line.segments.slice(Math.min(a, b), Math.max(a, b))) {
        if (!data[key]?.length) throw new Error("線形データが見つかりません。");
        const part = data[key];
        coords.push(...(coords.length ? part.slice(1) : part));
      }
      if (b < a) coords.reverse();
      return {
        coords,
        from: s.from,
        to: s.to,
        line: line.name,
        kind: line.kind,
        transfer: i > 0 && steps[i - 1].trip !== s.trip,
      };
    }),
  );
}
export function initialQuery(): Query {
  const p = new URLSearchParams(location.search);
  const day = p.get("date") ?? dateJST(Date.now());
  const parsed = Date.parse(day + "T00:00:00Z");
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === day
      ? day
      : dateJST(Date.now());
  const requestedTime = p.get("time") ?? "09:00";
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime)
    ? requestedTime
    : "09:00";
  return {
    from: p.get("from") ?? "大阪",
    to: p.get("to") ?? "京都",
    via: p.getAll("via"),
    date,
    time,
    mode: p.get("mode") === "arrive" ? "arrive" : "depart",
  };
}
export function queryParams(q: Query) {
  const params = new URLSearchParams({
    from: q.from,
    to: q.to,
    date: q.date,
    time: q.time,
    mode: q.mode,
  });
  for (const station of q.via ?? []) params.append("via", station);
  return params;
}
export const sources = {
  jr: "https://www.jr-odekake.net/railroad/mydia/",
  osaka: "https://timetable.jr-odekake.net/station-timetable/2796011001",
  kobe: "https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/",
  okaden: "https://okayama-kido.co.jp/tramway/",
};
export function compareLink(q: Query) {
  const [y, m, d] = q.date.split("-"),
    [hh, min] = q.time.split(":");
  const params = new URLSearchParams({
    from: q.from,
    to: q.to,
    y,
    m,
    d,
    hh,
    m1: min[0],
    m2: min[1],
    type: q.mode === "arrive" ? "4" : "1",
  });
  (q.via ?? []).forEach((station, i) => params.set("via" + (i + 1), station));
  return "https://transit.yahoo.co.jp/search/result?" + params.toString();
}
