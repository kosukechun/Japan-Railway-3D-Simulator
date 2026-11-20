"""Discover simple, all-station passenger line patterns from N02 topology."""

from collections import defaultdict
from hashlib import sha1
from heapq import heappop, heappush
from math import cos, floor, hypot, inf, radians
from zipfile import ZipFile
import json


TARGET_PREFECTURE_CODES = {
    "15", "16", "17", "18", "19", "20", "21", "22", "23", "24",
    "26", "27", "28", "29", "30", "31", "32", "33", "34", "35",
    "36", "37", "38", "39",
}
EXCLUDED_TERMS = ("貨物", "ケーブル", "索道", "鋼索", "ロープウェイ", "専用線")
GRID_DEGREES = 0.15


def distance(a, b):
    mid_lat = radians((a[1] + b[1]) / 2)
    return 111.195 * hypot((b[0] - a[0]) * cos(mid_lat), b[1] - a[1])


def point_in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y):
            crossing = (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]
            if x < crossing:
                inside = not inside
    return inside


def boundary_index(paths):
    polygons = []
    grid = defaultdict(list)
    prefecture_names = {}
    for path in paths:
        with ZipFile(path) as archive:
            names = archive.namelist()
            name = next((n for n in names if n.endswith("_prefecture.geojson")),
                        next(n for n in names if n.endswith(".geojson")))
            features = json.loads(archive.read(name))["features"]
        for feature in features:
            properties = feature["properties"]
            code = properties["N03_007"][:2]
            if code not in TARGET_PREFECTURE_CODES:
                continue
            prefecture_names[code] = properties["N03_001"]
            geometry = feature["geometry"]
            parts = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
            for polygon in parts:
                ring = [(point[0], point[1]) for point in polygon[0]]
                if len(ring) < 4:
                    continue
                index = len(polygons)
                polygons.append((code, ring))
                min_x, max_x = min(p[0] for p in ring), max(p[0] for p in ring)
                min_y, max_y = min(p[1] for p in ring), max(p[1] for p in ring)
                for x in range(floor(min_x / GRID_DEGREES), floor(max_x / GRID_DEGREES) + 1):
                    for y in range(floor(min_y / GRID_DEGREES), floor(max_y / GRID_DEGREES) + 1):
                        grid[x, y].append(index)
    if not polygons:
        raise ValueError("No target prefecture polygons found in N03 boundary archives")

    def locate(point):
        x = floor(point[0] / GRID_DEGREES)
        y = floor(point[1] / GRID_DEGREES)
        for index in grid.get((x, y), ()):
            code, ring = polygons[index]
            if point_in_ring(point, ring):
                return code
        return None

    return locate, prefecture_names


def graph_components(graph):
    seen = set()
    for start in graph:
        if start in seen:
            continue
        component = {start}
        pending = [start]
        seen.add(start)
        for point in pending:
            for adjacent in graph[point]:
                if adjacent not in seen:
                    seen.add(adjacent)
                    component.add(adjacent)
                    pending.append(adjacent)
        yield component


def station_order(path, station_features):
    position = {point: index for index, point in enumerate(path)}
    ordered = []
    for name, points in station_features:
        matches = [point for point in points if point in position]
        if not matches:
            continue
        center = (
            sum(point[0] for point in points) / len(points),
            sum(point[1] for point in points) / len(points),
        )
        anchor = min(matches, key=lambda point: distance(point, center))
        ordered.append((position[anchor], name, anchor, center))
    ordered.sort(key=lambda item: item[0])

    unique = []
    for item in ordered:
        if unique and unique[-1][0] == item[0]:
            if unique[-1][1] != item[1]:
                return None
            continue
        if unique and unique[-1][1] == item[1]:
            return None
        unique.append(item)
    return unique if len(unique) >= 2 else None


def graph_path(start, end, graph):
    distances = {start: 0.0}
    previous = {start: None}
    pending = [(0.0, start)]
    while pending:
        current_distance, point = heappop(pending)
        if current_distance != distances[point]:
            continue
        for adjacent, weight in graph[point].items():
            candidate = current_distance + weight
            if candidate < distances.get(adjacent, inf):
                distances[adjacent] = candidate
                previous[adjacent] = point
                heappush(pending, (candidate, adjacent))
    if end not in previous:
        return []

    path = []
    point = end
    while point is not None:
        path.append(point)
        point = previous[point]
    return path[::-1]


def ordered_components(component, graph, station_features):
    endpoints = [point for point in component if len(graph[point]) == 1]
    if len(endpoints) < 2 or len(endpoints) > 12:
        return []

    candidates = []
    for i, start in enumerate(endpoints):
        for end in endpoints[i + 1:]:
            path = graph_path(start, end, graph)
            ordered = station_order(path, station_features) if path else None
            if ordered:
                candidates.append(ordered)
    unique = {}
    for ordered in candidates:
        sequence = tuple(item[1] for item in ordered)
        key = min(sequence, sequence[::-1])
        unique[key] = ordered
    candidates = list(unique.values())
    return [
        candidate for candidate in candidates
        if not any(
            set(item[1] for item in candidate) < set(item[1] for item in other)
            for other in candidates
        )
    ]


def discover_n02_services(sections, stations, boundary_paths, curated_services):
    locate, prefecture_names = boundary_index(boundary_paths)
    curated = defaultdict(set)
    for service in curated_services:
        for track in service["tracks"]:
            curated[tuple(track)].update(name for name, _ in service["stations"])

    discovered = []
    discovered_ids = set()
    for group, station_features in stations.items():
        operator, route_name = group
        if any(term in operator or term in route_name for term in EXCLUDED_TERMS):
            continue
        graph = defaultdict(dict)
        for _, points in sections.get(group, ()):
            for a, b in zip(points, points[1:]):
                if a != b:
                    weight = distance(a, b)
                    graph[a][b] = graph[b][a] = weight
        if not graph:
            continue

        candidates = []
        seen_sequences = set()
        for component in graph_components(graph):
            for ordered in ordered_components(component, graph, station_features):
                sequence_key = tuple(item[1] for item in ordered)
                canonical_key = min(sequence_key, sequence_key[::-1])
                if canonical_key in seen_sequences:
                    continue
                seen_sequences.add(canonical_key)

                run = []
                for item in ordered:
                    name, anchor, center = item[1], item[2], item[3]
                    code = locate(center) or locate(anchor)
                    if code is None:
                        if len(run) >= 2:
                            candidates.append(run)
                        run = []
                        continue
                    run.append((name, prefecture_names[code], anchor))
                if len(run) >= 2:
                    candidates.append(run)

        for run in candidates:
            names = [name for name, _, _ in run]
            if len(names) != len(set(names)):
                continue
            if set(names).issubset(curated[group]):
                continue
            signature = "\0".join((operator, route_name, *names))
            identifier = "n02-" + sha1(signature.encode("utf-8")).hexdigest()[:12]
            if identifier in discovered_ids:
                continue
            discovered_ids.add(identifier)
            digest = sha1((operator + "\0" + route_name).encode("utf-8")).digest()
            color = "#" + "".join(f"{72 + value % 144:02x}" for value in digest[:3])
            if "旅客鉄道" in operator:
                kind = "shinkansen" if "新幹線" in route_name else "jr"
            elif "号線" in route_name or "地下鉄" in route_name:
                kind = "subway"
            else:
                kind = "private"
            discovered.append({
                "id": identifier,
                "name": f"{operator} {route_name}（各駅モデル）",
                "operator": operator,
                "kind": kind,
                "color": color,
                "tracks": [group],
                "stations": [(name, prefecture) for name, prefecture, _ in run],
                "_n02_auto": True,
                "_n02_anchors": [anchor for _, _, anchor in run],
            })
    return discovered
