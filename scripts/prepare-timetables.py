"""Import licensed railway, tram and subway timetables.

Run with Python 3.10+ from any directory. Use --download to fetch source
files into a temporary or caller-supplied directory. See TIMETABLE_SOURCES.md.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from service_patterns import STATION_IDS


ROOT = Path(__file__).resolve().parents[1]
OKAYAMA_ZIP = 'https://okdweb.jcld.jp/gtfs/gtfs.zip'
OKAYAMA_PAGE = 'https://loc.bus-vision.jp/ryobi/view/opendata.html'
AKECHI_ZIP = 'https://api.gtfs-data.jp/v2/organizations/aketetsu/feeds/akechirailway/files/feed.zip?rid=current'
ISE_ZIP = 'https://api.gtfs-data.jp/v2/organizations/isetetu/feeds/iserailway/files/feed.zip?rid=current'
KOBE_PAGE = 'https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/'
KYOTO_PAGE = 'https://data.city.kyoto.lg.jp/dataset/00692/'
KYOTO_FILES = {
    21114: ('karasuma', 'w', '20260313155657_tn020101_dia【R080314khu】.csv'),
    21115: ('karasuma', 'w', '20260313155726_tn020100_dia【R080314khd】.csv'),
    21116: ('karasuma', 'h', '20260313155751_tn020201_dia【R080314kdu】.csv'),
    21117: ('karasuma', 'h', '20260313155807_tn020200_dia【R080314kdd】.csv'),
    21118: ('kyoto-tozai', 'w', '20260313160854_tn010100_dia【R070222thd】.csv'),
    21119: ('kyoto-tozai', 'w', '20260313160922_tn010101_dia【R070222thu】.csv'),
    21120: ('kyoto-tozai', 'h', '20260313160946_tn010200_dia【R070222tdd】.csv'),
    21121: ('kyoto-tozai', 'h', '20260313161000_tn010201_dia【R070222tdu】.csv'),
}
CATALOG = 'https://catalog.city.kobe.lg.jp/dataset/f2d416e9-7dae-4938-b62e-7c717002d715/resource'
HOLIDAYS = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv'
KOBE_FILES = {
    'open_seishin_w_east_r070315.csv': '5b9ddc3a-0089-4817-bfb1-84dfd5086ff6',
    'open_seishin_w_west_r070315.csv': 'cae1c6b6-f784-4cd4-bdf9-8b0b91ef404f',
    'open_seishin_h_east_r070315.csv': 'd692c87a-fbe9-4fc7-aeeb-b1f0a67d9e8c',
    'open_seishin_h_west_r070315.csv': '6ec508b2-903d-44c9-b288-210fb759dacf',
    'open_kaigan_w_east.csv': '628220af-e363-4358-a4be-cf34e2b337f8',
    'open_kaigan_w_west.csv': 'd678abfa-7bf8-49dc-9fe6-4beb1158053a',
    'open_kaigan_h_east.csv': '066f715c-8d31-4b9b-b3ce-9decb9ae70b1',
    'open_kaigan_h_west.csv': '80b7cc7c-1ea3-4f5b-9bfb-badea44b9f41',
}
OKADEN_LINES = {
    '1001': ('okaden-higashiyama', '#dc7452'),
    '1002': ('okaden-seikibashi', '#5aa3d8'),
}
RAIL_FEEDS = {
    'akechi': {
        'url': AKECHI_ZIP, 'operator': '明知鉄道', 'page': 'https://www.aketetsu.co.jp/',
        'license': 'CC BY 4.0',
        'routes': {'1': ('akechi', '2'), '1C': ('akechi-express', '2'), '1D': ('akechi-express', '2')},
    },
    'ise-railway': {
        'url': ISE_ZIP, 'operator': '伊勢鉄道', 'page': 'https://isetetu.co.jp/',
        'license': 'CC BY 4.0',
        'routes': {'10': ('ise-railway', '2'), '20': ('ise-nanki', '2'), '30': ('ise-mie', '2')},
    },
    'toyama-tram': {
        'url': 'https://api.gtfs-data.jp/v2/organizations/chitetsu/feeds/chitetsushinaidensha/files/feed.zip?rid=current',
        'operator': '富山地方鉄道', 'page': 'https://gtfs-data.jp/search?agencyId=chitetsu&feedId=chitetsushinaidensha',
        'license': 'CC0 1.0',
        'routes': {
            '市内軌道線(3001-1)': ('toyama-tram-main', '3'),
            '市内軌道線(3001-2)': ('toyama-tram-main', '3'),
            '市内軌道線(3002-1)': ('toyama-tram-main', '3'),
            '市内軌道線(3002-2)': ('toyama-tram-main', '3'),
            '市内軌道線(3008-1)': ('toyama-tram-main', '3'),
            '市内軌道線(3008-2)': ('toyama-tram-main', '3'),
            '富山港線（南富山）(3004-1)': ('toyama-tram-port-south', '3'),
            '富山港線（南富山）(3004-2)': ('toyama-tram-port-south', '3'),
            '富山港線（南富山）(3004-3)': ('toyama-tram-port-south', '3'),
            '富山港線（南富山）(3004-4)': ('toyama-tram-port-south', '3'),
            '富山港線（富山大学前）(3005-1)': ('toyama-tram-port-university', '3'),
            '富山港線（富山大学前）(3005-2)': ('toyama-tram-port-university', '3'),
            '富山港線（富山大学前）(3005-3)': ('toyama-tram-port-university', '3'),
            '富山港線（富山大学前）(3005-4)': ('toyama-tram-port-university', '3'),
            '環状線(3003-1)': ('toyama-tram-loop', '3'),
        },
        'ignored_routes': {'富山港線（環状線）(3006-1)', '富山港線（環状線）(3006-2)'},
        'terminal_stop_ids': {'環状線(3003-1)': '富山駅（環状線終着）'},
    },
    'tosaden': {
        'url': 'https://api-public.odpt.org/api/v4/files/odpt/TosadenTraffic/Streetcar.zip?date=20260801',
        'operator': 'とさでん交通', 'page': 'https://ckan.odpt.org/dataset/tosaden_traffic_streetcar',
        'license': 'CC BY 4.0',
        'routes': {
            '東西線上り_A': ('tosaden-ino-gomen', '0'),
            '東西線下り_A': ('tosaden-ino-gomen', '0'),
            '南北線下り_A': ('tosaden-ino-sambashi', '0'),
            '南北線上り_A': ('tosaden-ino-sambashi', '0'),
        },
        'trip_service_candidates': {
            '南北線下り_A': (
                'tosaden-ino-sambashi', 'tosaden-gomen-sambashi',
                'tosaden-station-ino', 'tosaden-station-sambashi',
            ),
            '南北線上り_A': (
                'tosaden-ino-sambashi', 'tosaden-gomen-sambashi',
                'tosaden-station-ino', 'tosaden-station-sambashi',
            ),
        },
        'merge_consecutive_stops': {'はりまや橋'},
    },
    'toyotetsu': {
        'url': 'https://loc.bus-vision.jp/gtfs_v2/toyohashitetsudo/gtfsFeed',
        'operator': '豊橋鉄道', 'page': 'https://bus-viewer.jp/toyotetsu/view/opendataToyotetsu.html',
        'license': 'CC BY 4.0',
        'routes': {
            '10_1_20260108': ('toyohashi-atsumi', '2'),
            '10_2_20260108': ('toyohashi-azumada-akarock', '0'),
        },
        'trip_service_candidates': {
            '10_2_20260108': ('toyohashi-azumada-akarock', 'toyohashi-azumada-undokoen'),
        },
        'stop_name_suffixes': ('(渥美線)', '(市内線)'),
    },
}
WEEKDAYS = 'monday tuesday wednesday thursday friday saturday sunday'.split()


def download(target):
    sources = {'rail-okayama.zip': OKAYAMA_ZIP, 'syukujitsu.csv': HOLIDAYS}
    sources.update({f'{source}.zip': feed['url'] for source, feed in RAIL_FEEDS.items()})
    sources.update({name: f'{CATALOG}/{rid}/download/{name}' for name, rid in KOBE_FILES.items()})
    for rid, (_, _, filename) in KYOTO_FILES.items():
        fields = urllib.parse.urlencode({'download':'Download', 'upload_file':filename}).encode()
        sources[f'kyoto-{rid}.csv'] = urllib.request.Request(f'https://data.city.kyoto.lg.jp/resource/?id={rid}', data=fields)
    for name, url in sources.items():
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        if not data:
            raise ValueError(f'Empty response: {url}')
        (target / name).write_bytes(data)


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def parse_minutes(text):
    clock = [int(x) for x in text.split(':')]
    if len(clock) not in (2, 3) or min(clock) < 0 or max(clock[1:]) >= 60:
        raise ValueError(f'Invalid service time: {text}')
    seconds = clock[2] if len(clock) == 3 else 0
    return clock[0] * 60 + clock[1] + seconds / 60 if seconds else clock[0] * 60 + clock[1]


def gtfs_date(text):
    return datetime.strptime(text, '%Y%m%d').date().isoformat()


def distance(a, b):
    mid_lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((a[0] - b[0]) * math.cos(mid_lat), a[1] - b[1]) * 111.195


def split_shape(path, stations):
    # Project each platform onto the feed geometry in a local metric plane.
    # Retain the original vertices between the two platform projections.
    cos_lat = math.cos(math.radians(path[0][1]))
    splits = []
    for stop in stations:
        options = []
        for i, (a, b) in enumerate(zip(path, path[1:])):
            x, y = (b[0] - a[0]) * cos_lat, b[1] - a[1]
            if not (x or y):
                continue
            t = max(0, min(1, ((stop[0] - a[0]) * cos_lat * x + (stop[1] - a[1]) * y) / (x*x + y*y)))
            projected = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
            options.append((distance(stop, projected), i + t, projected))
        error, offset, point = min(options)
        if error > 0.15 or (splits and offset <= splits[-1][0]):
            raise ValueError(f'Unmatched platform in shape: {stop}')
        splits.append((offset, point))
    segments = []
    for (left, a), (right, b) in zip(splits, splits[1:]):
        points = [a, *path[math.floor(left)+1:math.ceil(right)], b]
        segments.append([[round(x, 7), round(y, 7)] for x, y in points])
    return segments


def import_okayama(archive, timetable):
    with zipfile.ZipFile(archive) as feed:
        def read(name):
            with feed.open(f'{name}.txt') as member:
                return list(csv.DictReader(io.TextIOWrapper(member, encoding='utf-8-sig', newline='')))

        info, = read('feed_info')
        stops = {s['stop_id']: s for s in read('stops')}
        routes = {r['route_id']: r for r in read('routes')}
        source = {
            'id': 'okaden', 'name': '岡山電気軌道株式会社（Bus-Vision）', 'url': OKAYAMA_PAGE,
            'operatorUrl': info['feed_publisher_url'], 'version': info['feed_version'],
            'start': gtfs_date(info['feed_start_date']), 'end': gtfs_date(info['feed_end_date']),
            'license': 'CC BY 4.0', 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        }
        timetable['sources'].append(source)
        calendars = timetable['calendars']
        for row in read('calendar'):
            key = 'okaden-' + row['service_id']
            calendars[key] = {
                'start': gtfs_date(row['start_date']), 'end': gtfs_date(row['end_date']),
                'week': [i for i, day in enumerate(WEEKDAYS, 1) if row[day] == '1'],
                'add': [], 'remove': [],
            }
        for row in read('calendar_dates'):
            key = 'okaden-' + row['service_id']
            day = gtfs_date(row['date'])
            if row['exception_type'] not in ('1', '2'):
                raise ValueError(f'Unknown exception: {row}')
            calendar = calendars.setdefault(key, {'week': [], 'start':day, 'end':day, 'add':[], 'remove':[]})
            calendar['add' if row['exception_type'] == '1' else 'remove'].append(day)
            if row['exception_type'] == '1':
                # Do not extend the ordinary weekly service when widening a calendar.
                if calendar['week'] and not calendar['start'] <= day <= calendar['end']:
                    raise ValueError(f'Addition outside weekly calendar requires explicit-date normalization: {row}')
                calendar['start'] = min(calendar['start'], day)
                calendar['end'] = max(calendar['end'], day)
        shapes = defaultdict(list)
        for p in sorted(read('shapes'), key=lambda r: int(r['shape_pt_sequence'])):
            shapes[p['shape_id']].append((float(p['shape_pt_lon']), float(p['shape_pt_lat'])))
        times = defaultdict(list)
        for row in sorted(read('stop_times'), key=lambda r: int(r['stop_sequence'])):
            if row.get('pickup_type', '0') not in ('', '0') or row.get('drop_off_type', '0') not in ('', '0'):
                raise ValueError(f'Restricted boarding requires a routing rule: {row}')
            times[row['trip_id']].append(row)
        longest = {}
        network_stations = {}
        for row in read('trips'):
            route = row['route_id']
            if route not in OKADEN_LINES or routes[route]['route_type'] != '0':
                raise ValueError(f'Unknown tram route {route}')
            calls = times[row['trip_id']]
            names = [stops[c['stop_id']]['stop_name'] for c in calls]
            timetable['trips'].append({
                'id': 'okaden-' + row['trip_id'], 'service': OKADEN_LINES[route][0], 'source': 'okaden',
                'calendar': 'okaden-' + row['service_id'], 'stops':names,
                'arr':[parse_minutes(c['arrival_time']) for c in calls],
                'dep':[parse_minutes(c['departure_time']) for c in calls],
            })
            if row['direction_id'] == '0' and len(calls) > len(longest.get(route, ([],))[0]):
                longest[route] = ([stops[c['stop_id']] for c in calls], row['shape_id'])
        network_lines, segments_by_line = [], {}
        for route, (calls, shape_id) in longest.items():
            coordinates = [(float(s['stop_lon']), float(s['stop_lat'])) for s in calls]
            names = [s['stop_name'] for s in calls]
            for name, (lon, lat) in zip(names, coordinates):
                network_stations[name] = {'id':name, 'name':name, 'prefecture':'岡山県', 'lon':lon, 'lat':lat}
            line_id, color = OKADEN_LINES[route]
            geometry = split_shape(shapes[shape_id], coordinates)
            ids = [f'{line_id}-{i}' for i in range(len(geometry))]
            segments_by_line[line_id] = dict(zip(ids, geometry))
            network_lines.append({
                'id':line_id, 'name':routes[route]['route_long_name'], 'operator':'岡山電気軌道',
                'kind':'private', 'color':color, 'stops':names, 'segments':ids,
                'distances':[round(sum(distance(a,b) for a,b in zip(seg,seg[1:])), 4) for seg in geometry],
            })
    return {'stations':list(network_stations.values()), 'lines':network_lines}, segments_by_line


def import_railway(source_id, archive, timetable, line_stops):
    source_info = RAIL_FEEDS[source_id]
    with zipfile.ZipFile(archive) as feed:
        def read(name):
            with feed.open(f'{name}.txt') as member:
                return list(csv.DictReader(io.TextIOWrapper(member, encoding='utf-8-sig', newline='')))

        info, = read('feed_info')
        stops = {s['stop_id']: s for s in read('stops')}
        routes = {r['route_id']: r for r in read('routes')}
        ignored_routes = source_info.get('ignored_routes', set())
        declared_routes = set(source_info['routes']) | ignored_routes
        if declared_routes != set(routes):
            raise ValueError(f'Unexpected railway routes in {source_id}: '
                             f'{set(routes) ^ declared_routes}')
        source = {
            'id': source_id, 'name': f'{source_info["operator"]} GTFS', 'url': source_info['page'],
            'operatorUrl': info['feed_publisher_url'], 'version': info['feed_version'],
            'start': gtfs_date(info['feed_start_date']), 'end': gtfs_date(info['feed_end_date']),
            'license': source_info['license'], 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        }
        timetable['sources'].append(source)
        calendars = timetable['calendars']
        for row in read('calendar'):
            key = f'{source_id}-{row["service_id"]}'
            calendars[key] = {
                'start': gtfs_date(row['start_date']), 'end': gtfs_date(row['end_date']),
                'week': [i for i, day in enumerate(WEEKDAYS, 1) if row[day] == '1'],
                'add': [], 'remove': [],
            }
        for row in read('calendar_dates'):
            key = f'{source_id}-{row["service_id"]}'
            day = gtfs_date(row['date'])
            if row['exception_type'] not in ('1', '2'):
                raise ValueError(f'Unknown exception: {row}')
            calendar = calendars.setdefault(key, {'week': [], 'start':day, 'end':day, 'add':[], 'remove':[]})
            calendar['add' if row['exception_type'] == '1' else 'remove'].append(day)
            if row['exception_type'] == '1' and not calendar['week']:
                calendar['start'] = min(calendar['start'], day)
                calendar['end'] = max(calendar['end'], day)
        times = defaultdict(list)
        for row in sorted(read('stop_times'), key=lambda r: int(r['stop_sequence'])):
            times[row['trip_id']].append(row)
        used_routes = set()
        for row in read('trips'):
            route_id = row['route_id']
            if route_id in ignored_routes:
                continue
            if route_id not in source_info['routes'] or routes[route_id]['route_type'] != source_info['routes'][route_id][1]:
                raise ValueError(f'Unknown railway route {route_id} in {source_id}')
            line_id = source_info['routes'][route_id][0]
            calls = list(times[row['trip_id']])
            while len(calls) > 2 and calls[0].get('pickup_type', '0') == '1':
                calls.pop(0)
            while len(calls) > 2 and calls[-1].get('drop_off_type', '0') == '1':
                calls.pop()
            if len(calls) < 2:
                raise ValueError(f'Trip has fewer than two stops: {row["trip_id"]}')
            if calls[0].get('pickup_type', '0') == '1' or calls[-1].get('drop_off_type', '0') == '1':
                raise ValueError(f'Unsupported endpoint restriction: {row["trip_id"]}')
            if any(c.get('pickup_type', '0') not in ('', '0') for c in calls[1:-1]):
                raise ValueError(f'Unsupported pickup restriction inside trip: {row["trip_id"]}')
            if any(c.get('drop_off_type', '0') not in ('', '0') for c in calls[1:-1]):
                raise ValueError(f'Unsupported drop-off restriction inside trip: {row["trip_id"]}')
            normalized_calls = []
            normalized_stops = []
            for call in calls:
                station_name = stops[call['stop_id']]['stop_name']
                for suffix in source_info.get('stop_name_suffixes', ()):
                    if station_name.endswith(suffix):
                        station_name = station_name[:-len(suffix)]
                        break
                station = STATION_IDS.get((source_info['operator'], station_name), station_name)
                if normalized_stops and normalized_stops[-1] == station:
                    if stops[call['stop_id']]['stop_name'] not in source_info.get('merge_consecutive_stops', set()):
                        raise ValueError(f'Unexpected repeated stop in {row["trip_id"]}: {station}')
                    normalized_calls[-1] = {**normalized_calls[-1], 'departure_time': call['departure_time']}
                    continue
                normalized_calls.append(call)
                normalized_stops.append(station)
            calls = normalized_calls
            terminal_stop_id = source_info.get('terminal_stop_ids', {}).get(route_id)
            if terminal_stop_id:
                last_name = stops[calls[-1]['stop_id']]['stop_name']
                if last_name != '富山駅':
                    raise ValueError(f'Unexpected circular-route terminal in {row["trip_id"]}: {last_name}')
                normalized_stops[-1] = terminal_stop_id
            candidates = source_info.get('trip_service_candidates', {}).get(route_id, (line_id,))
            matching_services = []
            for candidate in candidates:
                stations = line_stops.get(candidate)
                if stations is None:
                    raise ValueError(f'Unknown service pattern {candidate} in {source_id}')
                try:
                    indices = [stations.index(station) for station in normalized_stops]
                except ValueError:
                    continue
                changes = [b - a for a, b in zip(indices, indices[1:])]
                if all(step > 0 for step in changes) or all(step < 0 for step in changes):
                    matching_services.append(candidate)
            if not matching_services:
                raise ValueError(
                    f'No matching service pattern for trip {row["trip_id"]}: {normalized_stops}')
            line_id = min(matching_services, key=lambda candidate: (len(line_stops[candidate]), candidate))
            timetable['trips'].append({
                'id': f'{source_id}-{row["trip_id"]}', 'service': line_id, 'source': source_id,
                'calendar': f'{source_id}-{row["service_id"]}',
                'stops': normalized_stops,
                'arr': [parse_minutes(c['arrival_time']) for c in calls],
                'dep': [parse_minutes(c['departure_time']) for c in calls],
                **({'headsign': row['trip_headsign']} if row.get('trip_headsign') else {}),
            })
            used_routes.add(route_id)
        if used_routes != set(source_info['routes']):
            raise ValueError(f'Expected routes missing from {source_id}: {set(source_info["routes"]) - used_routes}')


def read_csv(path):
    blob = path.read_bytes()
    try:
        text = blob.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = blob.decode('cp932')
    return list(csv.reader(io.StringIO(text)))


def set_municipal_calendars(calendars, source, period, holidays):
    exceptions = sorted(d.isoformat() for d in holidays if period[0] <= d.isoformat() <= period[1] and d.isoweekday() <= 5)
    for day, week in [('w',[1,2,3,4,5]), ('h',[6,7])]:
        calendars[f'{source}-{day}'] = {
            'start':period[0], 'end':period[1], 'week':week,
            'add':exceptions if day == 'h' else [], 'remove':exceptions if day == 'w' else [],
        }


def import_kobe(inputs, timetable, normal_holidays):
    holidays = set(normal_holidays)
    # Published Kobe year-end service announcement (2025-12-29 through 2026-01-02).
    holidays.update(date(2025,12,d) for d in (29,30,31))
    holidays.add(date(2026,1,2))
    for line, period in {'seishin':('2025-03-15','2026-12-28'), 'kaigan':('2026-03-05','2026-03-13')}.items():
        source = f'kobe-{line}'
        timetable['sources'].append({
            'id':source, 'name':'神戸市交通局 地下鉄オープンデータ', 'url':KOBE_PAGE,
            'start':period[0], 'end':period[1], 'license':'CC BY 2.1 JP',
            'version':'2025年3月15日改正' if line == 'seishin' else '2026年3月5日市カタログ掲載・旧ダイヤ',
        })
        set_municipal_calendars(timetable['calendars'], source, period, holidays)
        for day in ['w', 'h']:
            calendar = f'{source}-{day}'
            for direction in ['east','west']:
                name, = [n for n in KOBE_FILES if n.startswith(f'open_{line}_{day}_{direction}')]
                rows = read_csv(inputs/name)
                if rows[0][0] != '始発駅' or rows[1][0] != '行先駅' or len({len(row) for row in rows}) != 1:
                    raise ValueError(f'Invalid timetable layout: {name}')
                for col in range(1, len(rows[0])):
                    values = [(row[0],parse_minutes(row[col])) for row in rows[2:] if row[col].strip()]
                    # Subway times after midnight belong to the preceding service day.
                    stops = [station for station, _ in values]
                    mins = [t + 1440 if t < 180 else t for _,t in values]
                    if stops[0] != ''.join(rows[0][col].split()) or stops[-1] != ''.join(rows[1][col].split()):
                        raise ValueError(f'Incorrect route endpoints: {name}, column {col}')
                    timetable['trips'].append({
                        'id':f'{calendar}-{direction}-{col}', 'service':source, 'source':source, 'calendar':calendar,
                        'stops':stops, 'arr':mins, 'dep':mins,
                    })


def import_kyoto(inputs, timetable, holidays):
    period = ('2026-03-14', '2026-12-28')
    source = 'kyoto-subway'
    timetable['sources'].append({
        'id':source, 'name':'京都市交通局 市営地下鉄時刻表', 'url':KYOTO_PAGE,
        'start':period[0], 'end':period[1], 'license':'CC BY 4.0',
        'version':'2026年3月14日版（東西線は2025年2月22日改正から変更なし）',
    })
    set_municipal_calendars(timetable['calendars'], source, period, holidays)
    # External sections have only selected stations, so terminate the imported
    # ride at the subway boundary. Never bridge missing stops via a straight line.
    excluded = {'近鉄奈良','新田辺','四宮','びわ湖浜大津'}
    aliases = {'東山':'東山（京都）', '山科':'山科（地下鉄）', '六地蔵':'六地蔵（地下鉄）'}
    for rid, (line_id, day, _) in KYOTO_FILES.items():
        rows = read_csv(inputs/f'kyoto-{rid}.csv')
        header = rows[3]
        if header[:2] != ['行先（終着）','始発']:
            raise ValueError(f'Invalid Kyoto timetable header in resource {rid}')
        for i,row in enumerate(rows[4:], 1):
            if len(row) != len(header):
                raise ValueError(f'Invalid Kyoto timetable in resource {rid}, row {i}')
            times, stops = [], []
            for stop, value in zip(header[2:], row[2:]):
                if value and stop not in excluded:
                    minute = parse_minutes(value)
                    times.append(minute + 1440 if minute < 180 else minute)
                    stops.append(aliases.get(stop, stop) if line_id == 'kyoto-tozai' else stop)
            timetable['trips'].append({
                'id':f'kyoto-{rid}-{i}', 'service':line_id, 'source':source, 'calendar':f'{source}-{day}',
                'headsign':row[0],
                'stops':stops, 'arr':times, 'dep':times,
            })


def validate(timetable, network):
    trips = timetable['trips']
    if len({t['id'] for t in trips}) != len(trips):
        raise ValueError('Duplicate trip IDs')
    stop_lists = {line['id']:line['stops'] for line in network['lines']}
    for trip in trips:
        arr, dep, stops = trip['arr'], trip['dep'], trip['stops']
        if len(stops) < 2 or len(stops) != len(arr) or len(arr) != len(dep) or trip['calendar'] not in timetable['calendars']:
            raise ValueError(f'Invalid stop sequence: {trip["id"]}')
        if any(a > d for a,d in zip(arr,dep)) or any(d > a for d,a in zip(dep,arr[1:])):
            raise ValueError(f'Non-monotone times: {trip["id"]}')
        if trip['service'] in stop_lists:
            try:
                indices = [stop_lists[trip['service']].index(s) for s in stops]
            except ValueError as error:
                raise ValueError(f'Unknown station in {trip["id"]} on {trip["service"]}: {error}') from error
            changes = [b-a for a,b in zip(indices,indices[1:])]
            if not (all(step > 0 for step in changes) or all(step < 0 for step in changes)):
                raise ValueError(f'Unsupported route variant: {trip["id"]}')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs', type=Path, default=Path(tempfile.gettempdir())/'railway-source-feeds')
    p.add_argument('--download', action='store_true')
    p.add_argument('--output', type=Path, default=ROOT/'public/data')
    args = p.parse_args()
    if args.download:
        args.inputs.mkdir(parents=True, exist_ok=True)
        download(args.inputs)
    network_path = args.output/'network.json'
    if not network_path.is_file():
        raise FileNotFoundError(f'Generate the N02 network before importing timetables: {network_path}')
    n02 = json.loads(network_path.read_text(encoding='utf-8'))
    line_stops = {line['id']: line['stops'] for line in n02['lines']}
    timetable = {'sources':[], 'calendars':{}, 'trips':[]}
    network, geometry = import_okayama(args.inputs/'rail-okayama.zip', timetable)
    for source_id in RAIL_FEEDS:
        import_railway(source_id, args.inputs/f'{source_id}.zip', timetable, line_stops)
    holidays = {datetime.strptime(r[0], '%Y/%m/%d').date() for r in read_csv(args.inputs/'syukujitsu.csv')[1:]}
    timetable['holidays'] = sorted(d.isoformat() for d in holidays if d.year >= 2025)
    import_kobe(args.inputs, timetable, holidays)
    import_kyoto(args.inputs, timetable, holidays)
    validate(timetable, {
        'stations': network['stations'] + n02['stations'],
        'lines': network['lines'] + n02['lines'],
    })
    for line_id, segments in geometry.items():
        write_json(args.output/'shapes'/f'{line_id}.json', segments)
    write_json(args.output/'okayama-network.json', network)
    write_json(args.output/'timetable.json', timetable)
    print(f'{len(timetable["trips"])} trips, {len(timetable["calendars"])} service calendars.')


if __name__ == '__main__':
    main()
