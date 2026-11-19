"""Build the offline regional basemap. Requires Pillow and two source archives.

python scripts/prepare-overview.py GRAY_HR_SR_W.zip N02-25_GML.zip
"""
import io
import json
import math
from pathlib import Path
import sys
from zipfile import ZipFile
from PIL import Image, ImageDraw

west, south, east, north = 122, 23, 148, 47
center = [135.4959,34.7024]
xscale = 111320 * math.cos(math.radians(center[1]))
target = Path('public/data')
target.mkdir(exist_ok=True, parents=True)
with ZipFile(sys.argv[1]) as archive:
    Image.MAX_IMAGE_PIXELS = None
    image = Image.open(io.BytesIO(archive.read('GRAY_HR_SR_W.tif')))
    px, py = image.width/360, image.height/180
    image = image.crop((round((west+180)*px),round((90-north)*py),round((east+180)*px),round((90-south)*py))).convert('L')
# Gray Earth uses a uniform value in ocean areas. Retain its varying terrain shading.
sea = image.getpixel((round((131-west)*px),round((north-24)*py)))
palette = []
for shade in range(256):
    color = (26,54,66) if shade==sea else (round(19+shade*.22),round(36+shade*.24),round(44+shade*.22))
    palette.extend(color)
image.putpalette(palette)
image = image.convert('RGB')
draw = ImageDraw.Draw(image)
local=[]
corridors=[]
with ZipFile(sys.argv[2]) as archive:
    name=next(n for n in archive.namelist() if n.endswith('RailroadSection.geojson') and '/UTF-8/' in n)
    for feature in json.loads(archive.read(name))['features']:
        geom=feature['geometry']
        for path in [geom['coordinates']] if geom['type']=='LineString' else geom['coordinates']:
            if len(path)<2:
                continue
            draw.line([((lon-west)*px,(north-lat)*py) for lon,lat,*_ in path],fill=(75,99,105))
            points=[]
            for lon,lat,*_ in path:
                x,y=round((lon-center[0])*xscale),round((lat-center[1])*111320)
                if abs(x)<6500 and abs(y)<6500:
                    if not points or (x,y)!=points[-1]:
                        points.append((x,y))
                else:
                    if len(points)>1:
                        part=[i for p in points for i in p]
                        local.append(part)
                        if feature['properties']['N02_004'] in ['西日本旅客鉄道','阪急電鉄']:
                            corridors.append(part)
                    points=[]
            if len(points)>1:
                part=[i for p in points for i in p]
                local.append(part)
                if feature['properties']['N02_004'] in ['西日本旅客鉄道','阪急電鉄']:
                    corridors.append(part)
image.save(target/'japan-overview.webp',quality=91,method=5)
(target/'osaka-track-context.json').write_text(json.dumps({'lines':local,'corridors':corridors},separators=(',',':')),encoding='utf8')
