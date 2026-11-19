"""Build the separately licensed Osaka street layer. Standard-library Python 3."""
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

lon, lat = 135.4959, 34.7024
scale = 111320 * math.cos(math.radians(lat))
big = "(34.654,135.439,34.756,135.555)"
near = "(34.688,135.477,34.717,135.516)"
query = (f'[out:json][timeout:45];('
         f'way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]{big};'
         f'way["highway"~"^(residential|unclassified|service)$"]{near};'
         f'way["waterway"~"^(river|canal)$"]{big};'
         f'way["natural"="water"]{big};way["leisure"="park"]{big};);out geom;')
request = Request('https://overpass-api.de/api/interpreter?' + urlencode({'data': query}),
                  headers={'User-Agent': 'JapanRailway3DSimulator/1.0 (offline Osaka basemap)'})
with urlopen(request, timeout=100) as stream:
    data = json.load(stream)
layers = {name: [] for name in ['road', 'major', 'river', 'water', 'park']}
for way in data['elements']:
    tags = way['tags']
    coords = [(round((p['lon']-lon)*scale), round((p['lat']-lat)*111320)) for p in way['geometry']]
    if 'highway' in tags:
        kind = 'road' if tags['highway'] in ['residential','unclassified','service','tertiary'] else 'major'
    elif 'waterway' in tags:
        kind = 'river'
    else:
        if coords[0] != coords[-1]:
            continue
        kind = 'water' if tags.get('natural') == 'water' else 'park'
    if len(coords)>1:
        layers[kind].append([i for p in coords for i in p])
output = Path('public/data/osaka-streets.json')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'center':[lon,lat], 'xScale':scale,'date':data['osm3s']['timestamp_osm_base'],
 'copyright':'© OpenStreetMap contributors', 'license':'https://opendatacommons.org/licenses/odbl/1-0/',
 'layers':layers}, separators=(',',':')),encoding='utf8')
print(output, output.stat().st_size)
