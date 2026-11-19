import { useEffect, useRef, useState } from "react";
import type { CameraMode, LightMode, RailwayMap, MapLeg } from "./map";
import { mapLegs } from "./data";
import { moment } from "./playback";
import { midnight } from "./time";
import { walk } from "./routing";
import type { Journey, Line, TrafficJourney } from "./types";
import { journeyKey, trafficPosition } from "./traffic";

interface Props {
  journey?: Journey;
  traffic: TrafficJourney[];
  lines: Map<string, Line>;
  date: string;
  minute: number;
  camera: CameraMode;
  light: LightMode;
  distance: number;
  angle: number;
  layers: { buildings: boolean; imagery: boolean; rail: boolean };
  onStation: (name: string) => void;
  onStatus: (s: string) => void;
}
export function MapView(p: Props) {
  const element = useRef<HTMLDivElement>(null),
    [map, ready] = useState<RailwayMap>(),
    [mapped, setMapped] = useState<Journey>();
  const callbacks = useRef(p);
  callbacks.current = p;
  const [traffic, setTraffic] = useState<
    { train: TrafficJourney; legs: MapLeg[] }[]
  >([]);
  useEffect(() => {
    let alive = true,
      instance: RailwayMap | undefined;
    import("./map")
      .then(({ RailwayMap }) => {
        if (alive && element.current) {
          instance = new RailwayMap(element.current, {
            onStatus: (s) => callbacks.current.onStatus(s),
            onStation: (s) => callbacks.current.onStation(s),
          });
          ready(instance);
        }
      })
      .catch(() =>
        callbacks.current.onStatus(
          "3D描画の読み込みに失敗しました。ページを再読み込みしてください。",
        ),
      );
    return () => {
      alive = false;
      instance?.destroy();
    };
  }, []);
  useEffect(() => {
    if (!map) return;
    let alive = true;
    setMapped(undefined);
    if (!p.journey) {
      map.setRoute([]);
      return;
    }
    mapLegs(p.journey, p.lines)
      .then((legs) => {
        if (alive) {
          map.setRoute(legs);
          setMapped(p.journey);
        }
      })
      .catch((e) => {
        if (alive) {
          map.setRoute([]);
          callbacks.current.onStatus(String(e));
        }
      });
    return () => {
      alive = false;
    };
  }, [map, p.journey, p.lines]);
  useEffect(() => {
    let alive = true;
    setTraffic([]);
    Promise.all(
      p.traffic.map(async (train) => {
        try {
          return { train, legs: await mapLegs(train.journey, p.lines) };
        } catch (e) {
          if (alive) callbacks.current.onStatus(String(e));
          return undefined;
        }
      }),
    ).then((items) => {
      if (alive)
        setTraffic(
          items.filter(
            (v): v is { train: TrafficJourney; legs: MapLeg[] } => !!v,
          ),
        );
    });
    return () => {
      alive = false;
    };
  }, [p.traffic, p.lines]);
  useEffect(() => {
    if (!map) return;
    const timeMs = midnight(p.date) + p.minute * 60000;
    const selected = p.journey ? journeyKey(p.journey, p.date) : "";
    map.setTraffic(
      traffic.flatMap(({ train, legs }) => {
        if (journeyKey(train.journey, train.date) === selected) return [];
        const position = trafficPosition(train, timeMs);
        return position
          ? [
              {
                id: train.id,
                legs,
                ...position,
                label: train.label,
                color: train.color,
              },
            ]
          : [];
      }),
    );
  }, [map, traffic, p.journey, p.minute, p.date]);
  useEffect(() => {
    if (!map || !mapped || mapped !== p.journey) return;
    const t = moment(mapped, p.minute);
    const index =
      mapped.steps.slice(0, t.mapIndex + 1).filter((s) => s.line !== walk)
        .length - 1;
    map.update(index, t.progress, midnight(p.date) + p.minute * 60000);
  }, [map, mapped, p.journey, p.date, p.minute]);
  useEffect(() => {
    map?.setCamera(p.camera);
  }, [map, p.camera, mapped]);
  useEffect(() => {
    map?.setLight(p.light);
  }, [map, p.light]);
  useEffect(() => {
    map?.setLayers(p.layers);
  }, [map, p.layers]);
  useEffect(() => {
    map?.setCameraOptions(p.distance, p.angle);
  }, [map, p.distance, p.angle]);
  return (
    <div className="globe" ref={element} aria-label="鉄道路線と列車の3D地図" />
  );
}
