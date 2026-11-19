// Rebuild the small offline Osaka Station building layer from PLATEAU's 2025 LOD1 mesh.
// Run with Node 20+ after npm ci. Coordinates are metres in a local tangent plane.
import fs from 'node:fs/promises';
import draco3d from 'draco3d';

const base = 'https://assets.cms.plateau.reearth.io/assets/73/bc9017-e521-43f2-8777-2837eefd9795/27100_osaka-shi_city_2025_citygml_1_op_bldg_3dtiles_27127_kita-ku_lod1/';
const [lon, lat] = [135.4959, 34.7024];
const radians = Math.PI / 180;
const xScale = Math.cos(lat * radians) * 111320;
const radius = 1300;
const module = await draco3d.createDecoderModule({});

async function download(path) {
  const response = await fetch(base + path);
  if (!response.ok) throw Error(path + ' HTTP ' + response.status);
  return response;
}

function visibleTiles(tile) {
  const [w,s,e,n] = tile.boundingVolume.region.map(angle => angle / radians);
  if (w > lon + radius/xScale || e < lon - radius/xScale ||
      s > lat + radius/111320 || n < lat - radius/111320) return [];
  if (tile.children?.length) return tile.children.flatMap(visibleTiles);
  return [tile.content.uri];
}

function hull(points) {
  points.sort((a,b) => a[0] - b[0] || a[1] - b[1]);
  const chain = arr => {
    const out = [];
    for (const c of arr) {
      while (out.length >= 2) {
        const a = out[out.length-2], b = out[out.length-1];
        if ((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]) > 1) break;
        out.pop();
      }
      out.push(c);
    }
    out.pop();
    return out;
  };
  return [...chain(points), ...chain(points.reverse())];
}

const slon = Math.sin(lon*radians), clon = Math.cos(lon*radians);
const slat = Math.sin(lat*radians), clat = Math.cos(lat*radians);
const e2 = 6.6943799901413165e-3;
const normal = 6378137/Math.sqrt(1-e2*slat*slat);
const origin = [normal*clat*clon, normal*clat*slon, normal*(1-e2)*slat];

function buildings(bytes) {
  const glb = 28 + [12,16,20,24].reduce((sum, off) => sum + bytes.readUInt32LE(off), 0);
  const size = bytes.readUInt32LE(glb+12);
  const gltf = JSON.parse(bytes.toString('utf8', glb+20, glb+20+size));
  const [cx,cy,cz] = gltf.extensions.CESIUM_RTC.center.map((v,i) => v-origin[i]);
  const groups = new Map();
  for (const primitive of gltf.meshes[0].primitives) {
    const ext = primitive.extensions.KHR_draco_mesh_compression;
    const view = gltf.bufferViews[ext.bufferView];
    const start = glb+28+size+(view.byteOffset ?? 0);
    const compressed = bytes.subarray(start,start+view.byteLength);
    const decoder = new module.Decoder(), buffer = new module.DecoderBuffer(), mesh = new module.Mesh();
    buffer.Init(compressed, compressed.length);
    const status = decoder.DecodeBufferToMesh(buffer,mesh);
    if (!status.ok()) throw Error(status.error_msg());
    const positions = new module.DracoFloat32Array(), ids = new module.DracoInt32Array();
    decoder.GetAttributeFloatForAllPoints(mesh,decoder.GetAttributeByUniqueId(mesh,ext.attributes.POSITION),positions);
    decoder.GetAttributeInt32ForAllPoints(mesh,decoder.GetAttributeByUniqueId(mesh,ext.attributes._BATCHID),ids);
    for (let i=0;i<mesh.num_points();i++) {
      const x=cx+positions.GetValue(i*3), y=cy-positions.GetValue(i*3+2), z=cz+positions.GetValue(i*3+1);
      const east = -slon*x+clon*y, north = -slat*clon*x-slat*slon*y+clat*z;
      const height = clat*clon*x+clat*slon*y+slat*z;
      const id = ids.GetValue(i);
      if (!groups.has(id)) groups.set(id,{min: Infinity,max:-Infinity,pts:[]});
      const group = groups.get(id);
      group.min = Math.min(group.min,height);
      group.max = Math.max(group.max,height);
      group.pts.push([Math.round(east),Math.round(north)]);
    }
    for (const object of [ids,positions,mesh,buffer,decoder]) module.destroy(object);
  }
  const result=[];
  for (const group of groups.values()) {
    const poly=hull(group.pts);
    if (poly.length<3 || group.max-group.min<3 ||
        !poly.some(([x,y])=>Math.abs(x)<radius && Math.abs(y)<radius)) continue;
    result.push([Math.round(group.min),Math.round(group.max-group.min),...poly.flat()]);
  }
  return result;
}

const manifest = await (await download('tileset.json')).json();
const data = [];
for (const path of visibleTiles(manifest.root)) {
  data.push(...buildings(Buffer.from(await (await download(path)).arrayBuffer())));
}
await fs.mkdir('public/data',{recursive:true});
await fs.writeFile('public/data/osaka-buildings.json',JSON.stringify({center:[lon,lat],xScale,buildings:data}));
console.log(data.length + ' generalized building footprints');
