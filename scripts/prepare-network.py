"""Convert an official MLIT N02 ZIP into a browser index and on-demand shapes.

Usage: python scripts/prepare-network.py path/to/N02-25_GML.zip
Only track vertices belonging to a service's approved operator/line pairs may
form edges. Unreachable stops are an error rather than a straight-line fallback.
"""

import argparse
from collections import defaultdict
from functools import lru_cache
from hashlib import sha1
from heapq import heappush, heappop
import json
from math import cos, hypot, radians, inf
from pathlib import Path
from zipfile import ZipFile

from discover_n02_services import discover_n02_services
from service_patterns import PLATFORM_GAPS_KM, SERVICES, STATION_IDS


def km(a, b):
    return 111.195 * hypot((b[0] - a[0]) * cos(radians((a[1] + b[1]) / 2)), b[1] - a[1])


def length(path):
    return sum(km(a, b) for a, b in zip(path, path[1:]))


def read_features(archive, kind):
    name = next(n for n in archive.namelist() if n.endswith(kind + ".geojson") and "UTF-8/" in n)
    grouped = defaultdict(list)
    for f in json.loads(archive.read(name))["features"]:
        p = f["properties"]
        lines = f["geometry"]["coordinates"]
        if f["geometry"]["type"] == "LineString":
            lines = [lines]
        for part in lines:
            coords = [tuple(round(float(n), 6) for n in point[:2]) for point in part]
            grouped[p["N02_004"], p["N02_003"]].append((p.get("N02_005"), coords))
    return grouped


def build_graph(track_pairs, route_features):
    graph = defaultdict(dict)
    for group in track_pairs:
        for _, part in route_features[group]:
            for a, b in zip(part, part[1:]):
                if a != b:
                    graph[a][b] = graph[b][a] = km(a, b)
    return graph


def anchors(groups, station_features, graph):
    by_name = defaultdict(list)
    for group in groups:
        for name, points in station_features[group]:
            # N02 station geometry overlaps the railway. Select an existing
            # railway vertex near the middle of the recorded platform shape.
            middle = ((points[0][0] + points[-1][0]) / 2, (points[0][1] + points[-1][1]) / 2)
            matches = [point for point in points if point in graph]
            if matches:
                by_name[name].append(min(matches, key=lambda p: km(p, middle)))
    return by_name


def shortest(graph, sources, targets):
    queue = [(0.0, s) for s in sorted(set(sources))]
    prev = {s: None for s in sources}
    dist = {s: 0.0 for s in sources}
    targets = set(targets)
    while queue:
        d, point = heappop(queue)
        if point in targets:
            path = []
            while point is not None:
                path.append(point)
                point = prev[point]
            return path[::-1]
        if d != dist[point]:
            continue
        for next_point, step in graph[point].items():
            nd = d + step
            if nd < dist.get(next_point, inf):
                dist[next_point] = nd
                prev[next_point] = point
                heappush(queue, (nd, next_point))
    return []


def save(path, data):
    path.parent.mkdir(exist_ok=True, parents=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
                    encoding="utf-8")


def build(zip_path, out_dir, boundary_paths):
    with ZipFile(zip_path) as archive:
        sections = read_features(archive, "RailroadSection")
        stations = read_features(archive, "Station")

    services = list(SERVICES)
    if boundary_paths:
        discovered = discover_n02_services(sections, stations, boundary_paths, SERVICES)
        services.extend(discovered)
        print(f"Discovered {len(discovered)} additional N02 line patterns.")

    @lru_cache(maxsize=2)
    def track_set(groups):
        graph = build_graph(groups, sections)
        return graph, anchors(groups, stations, graph)

    stops_by_id = {}
    stations_by_name = defaultdict(list)
    remembered_ids = set()

    def remember_station(name, identifier, coord):
        if identifier not in remembered_ids:
            stations_by_name[name].append((identifier, coord))
            remembered_ids.add(identifier)

    def auto_station_id(name, operator, coord):
        nearby = [
            (km(location, coord), identifier)
            for identifier, location in stations_by_name[name]
            if km(location, coord) <= 0.8
        ]
        if nearby:
            return min(nearby)[1]
        if not stations_by_name[name]:
            identifier = name
        else:
            base = f"{name}（{operator}）"
            previous = stops_by_id.get(base)
            if previous and previous["name"] == name and km((previous["lon"], previous["lat"]), coord) <= 0.8:
                identifier = base
            elif base not in stops_by_id:
                identifier = base
            else:
                suffix = sha1(f"{name}\0{operator}\0{coord[0]:.4f}\0{coord[1]:.4f}".encode("utf-8")).hexdigest()[:6]
                identifier = f"{base}-{suffix}"
        remember_station(name, identifier, coord)
        return identifier

    lines = []
    shape_files = {}
    for service in services:
        graph, platforms = track_set(tuple(service["tracks"]))
        if service.get("_n02_auto"):
            platforms = {
                name: [anchor]
                for (name, _), anchor in zip(service["stations"], service["_n02_anchors"])
            }
        line = {k: v for k, v in service.items()
                if k not in ("tracks", "stations", "station_ids", "station_labels",
                             "_n02_auto", "_n02_anchors")}
        station_names = [s for s, _ in service["stations"]]
        station_id_overrides = service.get("station_ids", {})
        station_label_overrides = service.get("station_labels", {})
        if service.get("_n02_auto"):
            identifiers = [
                auto_station_id(name, service["operator"], anchor)
                for name, anchor in zip(station_names, service["_n02_anchors"])
            ]
        else:
            identifiers = [
                station_id_overrides.get(index, STATION_IDS.get((service["operator"], name), name))
                for index, name in enumerate(station_names)
            ]
        line.update(stops=identifiers, segments=[], distances=[])
        shapes = {}
        previous_end = None
        for i, (a, b) in enumerate(zip(station_names, station_names[1:])):
            points = shortest(graph, [previous_end] if previous_end else platforms[a], platforms[b])
            if previous_end and not points:
                points = shortest(graph, platforms[a], platforms[b])
            if len(points) < 2:
                raise ValueError(f"{line['id']}: no connected N02 tracks between {a} and {b}: {platforms[a]} / {platforms[b]}")
            if previous_end and km(previous_end, points[0]) > PLATFORM_GAPS_KM.get((line["id"], a), 0):
                raise ValueError(f"{line['id']}: platform discontinuity at {a}")
            previous_end = points[-1]
            distance = length(points)
            key = str(i)
            line["segments"].append(key)
            line["distances"].append(round(distance, 3))
            shapes[key] = points
            for index, identifier, (name, pref), (lon, lat) in zip(
                    (i, i + 1), identifiers[i:i+2], service["stations"][i:i+2], (points[0], points[-1])):
                display_name = station_label_overrides.get(index, name)
                old = stops_by_id.get(identifier)
                if old and km((old["lon"], old["lat"]), (lon, lat)) > 0.8:
                    raise ValueError(f"conflicting station identity: {name}")
                station = stops_by_id.setdefault(identifier, dict(id=identifier, name=display_name, prefecture=pref, lon=lon, lat=lat, operators=[]))
                remember_station(name, identifier, (station["lon"], station["lat"]))
                if line["operator"] not in station["operators"]:
                    station["operators"].append(line["operator"])
        lines.append(line)
        shape_files[line["id"]] = shapes
        print(f"{line['id']:18} {len(identifiers):3} stops  {sum(line['distances']):6.1f} km")
    for line_id, shapes in shape_files.items():
        save(out_dir / "shapes" / (line_id + ".json"), shapes)
    save(out_dir / "network.json", dict(stations=list(stops_by_id.values()), lines=lines))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "public/data")
    parser.add_argument("--boundaries", type=Path, nargs="*", default=[])
    args = parser.parse_args()
    build(args.zip, args.out, args.boundaries)
