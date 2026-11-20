import * as C from 'cesium'
import { OSAKA } from './map-math'
import type {City} from './local-map'

export function cityTransform(terrainHeight:number) {
  return C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(...OSAKA,terrainHeight))
}

/** Batch the municipal building footprints into one draw call. Local vertical datum starts at the station. */
export function osakaMesh(city:City) {
  const positions:number[]=[],colors:number[]=[],normals:number[]=[],indices:number[]=[],uv:number[]=[]
  const vertex=(x:number,y:number,z:number,nx:number,ny:number,nz:number,r:number,g:number,b:number)=>{
    const idx=positions.length/3
    positions.push(x,y,z);normals.push(nx,ny,nz);colors.push(r,g,b,255)
    return idx
  }
  for(let i=0;i<city.buildings.length;i++) {
    const [ground,height,...poly]=city.buildings[i]
    const n=poly.length/2,base=ground-37.4,top=height+base
    const first=positions.length/3,shade=(i%11)*1.5
    for(let j=0;j<n;j++){vertex(poly[j*2],poly[j*2+1],top,0,0,1,109+shade,135+shade,147+shade);uv.push(-1,-1)}
    for(let j=1;j<n-1;j++)indices.push(first,first+j,first+j+1)
    for(let j=0;j<n;j++) {
      const k=(j+1)%n,x=poly[j*2],y=poly[j*2+1],xx=poly[k*2],yy=poly[k*2+1]
      const length=Math.hypot(xx-x,yy-y)||1,nx=(yy-y)/length,ny=(x-xx)/length
      const a=positions.length/3
      for(const [px,py,h] of [[x,y,base],[xx,yy,base],[xx,yy,top],[x,y,top]]) {
        vertex(px,py,h,nx,ny,0,86+shade,111+shade,126+shade)
        uv.push(Math.hypot(px-x,py-y),h-base)
      }
      indices.push(a,a+1,a+2,a,a+2,a+3)
    }
  }
  const attributes=new C.GeometryAttributes()
  attributes.position=new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)})
  attributes.normal=new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(normals)})
  attributes.color=new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.UNSIGNED_BYTE,componentsPerAttribute:4,normalize:true,values:new Uint8Array(colors)})
  attributes.st=new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uv)})
  const mesh=new C.Geometry({attributes,indices:new Uint32Array(indices),primitiveType:C.PrimitiveType.TRIANGLES,
    boundingSphere:C.BoundingSphere.fromVertices(positions)})
  const standard=new C.PerInstanceColorAppearance({translucent:false,closed:true})
  const vertexShaderSource='in vec2 st; out vec2 facadeMetres;\n'+standard.vertexShaderSource.replace('v_color = color;', 'v_color = color; facadeMetres = st;')
  const fragmentShaderSource='in vec2 facadeMetres;\n'+standard.fragmentShaderSource.replace('material.alpha = color.a;',`
    material.alpha = color.a;
    // Schematic windows: local metre spacing, fading to a solid facade at distance.
    vec2 cell = fract(facadeMetres / vec2(3.5, 3.8));
    float detail = 1.0-smoothstep(0.65, 2.4, max(fwidth(facadeMetres.x), fwidth(facadeMetres.y)));
    float window = step(0.16,cell.x)*step(cell.x,0.86)*step(0.22,cell.y)*step(cell.y,0.84)*step(0.0,facadeMetres.y);
    material.diffuse *= 1.0-0.22*window*detail;
    vec2 id = floor(facadeMetres / vec2(3.5, 3.8));
    float occupied = step(0.64,fract(sin(dot(id,vec2(12.98,67.14)))*43758.54));
    float dark = 1.0-smoothstep(-0.10,0.10,dot(normalize(czm_viewerPositionWC),czm_sunDirectionWC));
    material.emission += vec3(.64,.40,.15)*window*occupied*detail*dark;
  `)
  return new C.Primitive({geometryInstances:new C.GeometryInstance({geometry:mesh}),
    appearance:new C.PerInstanceColorAppearance({translucent:false,closed:true,vertexShaderSource,fragmentShaderSource}),
    modelMatrix:cityTransform(0),asynchronous:false,compressVertices:false,allowPicking:false,shadows:C.ShadowMode.DISABLED})
}
