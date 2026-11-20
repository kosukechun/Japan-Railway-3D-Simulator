// Original boxy glTF vehicles. Local Z is forward, Y is up; dimensions in metres.
import fs from 'node:fs/promises';
const palettes = {
  jr: ['#c5d6db','#12747d',1.4,3.65,19.5],
  private: ['#773447','#efc99e',1.39,3.58,19.5],
  shinkansen: ['#e7eef1','#244b8d',1.64,3.75,24],
  subway: ['#bbc7d0','#d76c32',1.32,3.22,18.5],
  express: ['#e5ded2','#993e35',1.46,3.92,20.5],
};
const linear = h => [1,3,5].map(i => {
  const x = parseInt(h.slice(i,i+2),16)/255;
  return x<0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4;
});
function train([shell,stripe,width,top,length],role) {
  const mats = [shell,stripe,'#263b46','#47535c','#99b9c7','#fff4c8','#8c312f'].map((hex,i)=>({
    pbrMetallicRoughness:{baseColorFactor:[...linear(hex),1], metallicFactor:0.15,roughnessFactor:0.66},
    emissiveFactor:i===4?[0.9,0.64,0.30]:i===5?[1,0.9,0.62]:i===6?[1,0.04,0.03]:[0,0,0],
    doubleSided:true,
  }));
  const groups = mats.map(()=>({p:[],n:[]}));
  function quad(mat,a,b,c,d) {
    const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n)||1;
    for(const p of [a,b,c,a,c,d]) { groups[mat].p.push(...p); groups[mat].n.push(...n.map(x=>x/length)); }
  }
  function box(mat,x,y,z,w,h,l) {
    const ring=zz=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+a*w/2,y+b*h/2,zz]);
    const a=ring(z-l/2),b=ring(z+l/2);
    for(let i=0;i<4;i++){const j=(i+1)%4;quad(mat,a[i],a[j],b[j],b[i]);}
    quad(mat,...a.reverse());quad(mat,...b);
  }
  const rear=-length/2, end=length/2, bodyHeight=top-.75;
  box(0,0,.75+bodyHeight/2,0,width*2,bodyHeight,length-.3);
  box(0,0,top+.08,0,width*1.86,.16,length-.7);
  for(const side of [-1,1]) {
    box(1,side*(width+.01),1.68,0,.035,.25,length-.8);
    for(let j=0;j<9;j++) {
      const z=rear+1.25+j*(length-2.5)/8;
      if(j===2||j===6) box(3,side*(width+.025),1.72,z,.045,1.95,.9);
      else box(4,side*(width+.025),top-.93,z,.045,.72,.95);
    }
  }
  for(const z of [-length*.31,length*.31]) {
    box(3,0,.54,z,width*1.68,.6,2.8);
  }
  if(role!=='car') {
    box(2,0,top-.78,end+.03,width*1.22,.55,.08);
    const light=role==='tail'?6:5;
    for(const side of [-1,1]) {
      box(light,side*width*.66,1.05,end+.06,.2,.16,.08);
    }
  }
  const accessors=[], bufferViews=[], parts=[], primitives=[];
  let byteLength=0;
  function attribute(data,position) {
    const buffer=Buffer.from(new Float32Array(data).buffer);
    const view=bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:buffer.length,target:34962})-1;
    parts.push(buffer);byteLength+=buffer.length;
    const desc={bufferView:view,componentType:5126,count:data.length/3,type:'VEC3'};
    if(position) {
      const axes=[0,1,2].map(axis=>data.filter((_,i)=>i%3===axis));
      desc.min=axes.map(v=>Math.min(...v));desc.max=axes.map(v=>Math.max(...v));
    }
    return accessors.push(desc)-1;
  }
  groups.forEach(({p,n},i)=>{
    if(p.length) primitives.push({attributes:{POSITION:attribute(p,true),NORMAL:attribute(n,false)},material:i});
  });
  const gltf={asset:{version:'2.0',generator:'Japan Railway 3D Simulator'},buffers:[{byteLength}],bufferViews,accessors,
    materials:mats,meshes:[{primitives}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  let json=JSON.stringify(gltf);json=json.padEnd(Math.ceil(json.length/4)*4);
  const header=Buffer.alloc(20),binary=Buffer.alloc(8);
  header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+byteLength,8);
  header.writeUInt32LE(json.length,12);header.write('JSON',16);
  binary.writeUInt32LE(byteLength,0);binary.write('BIN\0',4);
  return Buffer.concat([header,Buffer.from(json),binary,...parts]);
}
await fs.mkdir('public/models',{recursive:true});
for(const [kind,palette] of Object.entries(palettes)) {
  for(const role of ['cab','car','tail']) await fs.writeFile('public/models/'+kind+'-'+role+'.glb',train(palette,role));
}
