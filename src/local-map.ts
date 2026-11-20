import { OSAKA, sample, routePose, type LngLat, type Track, type CameraMode, type TrafficPosition } from './map-math'
export type City = { center: LngLat; xScale:number; buildings:number[][] }
export type RailContext = {lines:number[][];corridors:number[][]}
type Streets = { center:LngLat; xScale:number; layers:Record<'road'|'major'|'river'|'park'|'water', number[][]> }
export const STREET_RANGE=6200
export const EAST_SCALE = Math.cos(OSAKA[1]*Math.PI/180)*111320
const METRES=111320
export async function readLocal<T>(file:string,signal:AbortSignal):Promise<T> {
  const res=await fetch(import.meta.env.BASE_URL+'data/'+file,{signal})
  if(!res.ok) throw Error('地図データが読み込めません')
  return res.json()
}
/** Keep the train visible when the recorded station is covered by a roof or a concourse. */
export function cutStationRoofs(city:City,context:RailContext) {
  const grid=new Map<string,number[][]>()
  for(const path of context.corridors)for(let j=2;j<path.length;j+=2){
    const x=path[j-2],y=path[j-1],dx=path[j]-x,dy=path[j+1]-y
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/9))
    for(let k=0;k<steps;k++){
      const px=x+dx*k/steps,py=y+dy*k/steps
      if(Math.abs(px)>1700||Math.abs(py)>1700)continue
      const key=Math.floor(px/40)+','+Math.floor(py/40)
      const points=grid.get(key)??[];points.push([px,py]);grid.set(key,points)
    }
  }
  function covers(row:number[],px:number,py:number){
    let inside=false
    for(let i=2,j=row.length-2;i<row.length;j=i,i+=2){
      const x=row[i],y=row[i+1],xx=row[j],yy=row[j+1]
      if((y>py)!==(yy>py)&&px<(xx-x)*(py-y)/(yy-y)+x)inside=!inside
      const dx=xx-x,dy=yy-y,f=Math.max(0,Math.min(1,((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy||1)))
      if((px-x-dx*f)**2+(py-y-dy*f)**2<18**2)return true
    }
    return inside
  }
  for(const row of city.buildings){
    const xs=row.slice(2).filter((_,i)=>i%2===0),ys=row.slice(3).filter((_,i)=>i%2===0)
    const west=Math.floor((Math.min(...xs)-18)/40),east=Math.floor((Math.max(...xs)+18)/40)
    const south=Math.floor((Math.min(...ys)-18)/40),north=Math.floor((Math.max(...ys)+18)/40)
    scan:for(let x=west;x<=east;x++)for(let y=south;y<=north;y++){
      if(grid.get(x+','+y)?.some(([px,py])=>covers(row,px,py))){row[1]=0;break scan}
    }
  }
  city.buildings=city.buildings.filter(row=>row[1]>0)
  return city
}
export async function streetImage(signal:AbortSignal,rail:RailContext) {
  const {layers}=await readLocal<Streets>('osaka-streets.json',signal)
  const canvas=document.createElement('canvas')
  canvas.width=canvas.height=2048
  const c=canvas.getContext('2d')!
  c.fillStyle='#293d45';c.fillRect(0,0,canvas.width,canvas.height)
  const scale=canvas.width/(2*STREET_RANGE)
  c.setTransform(scale,0,0,-scale,canvas.width/2,canvas.height/2)
  c.lineCap='round';c.lineJoin='round'
  function paths(kind:keyof typeof layers,color:string,width:number,fill=false) {
    c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;c.beginPath()
    for(const p of layers[kind]) {
      c.moveTo(p[0],p[1])
      for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1])
      if(fill)c.closePath()
    }
    if(fill)c.fill();else c.stroke()
  }
  paths('park','#355149',1,true);paths('river','#1a5364',42)
  paths('water','#1c5262',1,true);paths('road','#4d5d60',6)
  paths('major','#1f313b',22);paths('major','#677277',11)
  c.beginPath()
  for(const p of rail.lines){c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1])}
  c.strokeStyle='#182e36';c.lineWidth=15;c.stroke();c.strokeStyle='#83a4a4';c.lineWidth=4;c.stroke()
  return canvas
}

/** The same geographic track and footprint data remain usable without WebGL. */
export class CanvasMap {
  canvas=document.createElement('canvas')
  city?:City; streets?:HTMLCanvasElement
  private overview=new Image()
  tracks:Track[]=[];index=0;progress=0;elevation=30
  traffic:TrafficPosition[]=[]
  mode:CameraMode='follow';range=300; showRail=true; showBuildings=true; showMap=true
  center:LngLat=[...OSAKA]; zoom=1; drag?:{x:number;y:number}
  private marks:{x:number;y:number;name:string}[]=[]
  private observer:ResizeObserver
  private frame=0
  private tiles=new Map<string,HTMLImageElement>()
  constructor(el:HTMLElement,select?:(name:string)=>void) {
    this.overview.onload=()=>this.render()
    this.overview.src=import.meta.env.BASE_URL+'data/japan-overview.webp'
    this.canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none'
    this.canvas.setAttribute('aria-label','実地形状を使った簡易地図');el.append(this.canvas)
    this.observer=new ResizeObserver(()=>this.render());this.observer.observe(el)
    this.canvas.onwheel=e=>{e.preventDefault();this.zoom=Math.max(.15,Math.min(12,this.zoom*Math.exp(-e.deltaY*.001)));this.render()}
    this.canvas.onpointerdown=e=>{this.drag={x:e.offsetX,y:e.offsetY};this.canvas.setPointerCapture(e.pointerId)}
    this.canvas.onpointerup=e=>{
      if (this.drag && Math.hypot(e.offsetX-this.drag.x,e.offsetY-this.drag.y)<7) {
        const hit=this.marks.find(m=>Math.hypot(e.offsetX-m.x,e.offsetY-m.y)<22)
        if(hit)select?.(hit.name)
      }
      this.drag=undefined
    }
    this.canvas.onpointermove=e=>{
      if(!this.drag||this.mode!=='free')return
      const s=this.scale()
      this.center[0]-=e.movementX/s/EAST_SCALE;this.center[1]+=e.movementY/s/METRES
      this.render()
    }
  }
  private scale() {
    const w=this.canvas.clientWidth||800,h=this.canvas.clientHeight||480
    if(this.mode==='overview' && this.tracks.length){
      const bounds=this.bounds()
      return this.zoom*Math.min(w*.8/Math.max(200,(bounds[2]-bounds[0])*EAST_SCALE),h*.78/Math.max(200,(bounds[3]-bounds[1])*METRES))
    }
    return this.zoom*Math.min(w,h)/Math.max(this.mode==='aerial'?2500:760,this.range*2)
  }
  private bounds(){
    const b=[Infinity,Infinity,-Infinity,-Infinity]
    for(const t of [...this.tracks,...this.traffic.flatMap(item=>item.tracks)])for(const [x,y] of t.coords) {
      b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y)
    }
    return b
  }
  private baseTiles(ctx:CanvasRenderingContext2D,w:number,h:number,scale:number,sy:number){
    const zoom=Math.max(5,Math.min(17,Math.round(Math.log2(scale*40075016*Math.cos(this.center[1]*Math.PI/180)/256))))
    const n=2**zoom
    const tileX=(lon:number)=>(lon+180)/360*n
    const tileY=(lat:number)=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)*n/2
    const north=(y:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI
    const dx=w/(2*scale*EAST_SCALE),dy=h/(2*sy*METRES)
    ctx.save();ctx.globalAlpha=.76;ctx.filter='saturate(.55) brightness(.8)'
    for(let x=Math.floor(tileX(this.center[0]-dx));x<=tileX(this.center[0]+dx);x++){
      for(let y=Math.floor(tileY(this.center[1]+dy));y<=tileY(this.center[1]-dy);y++){
        const key=zoom+'/'+x+'/'+y
        let img=this.tiles.get(key)
        if(!img){
          img=new Image();img.onload=()=>this.render()
          img.src='https://cyberjapandata.gsi.go.jp/xyz/pale/'+key+'.png'
          this.tiles.set(key,img)
          if(this.tiles.size>180)this.tiles.delete(this.tiles.keys().next().value!)
        }
        if(img.complete&&img.naturalWidth){
          const xx=w/2+((x/n*360-180)-this.center[0])*EAST_SCALE*scale
          const yy=h/2-(north(y)-this.center[1])*METRES*sy
          ctx.drawImage(img,xx,yy,360/n*EAST_SCALE*scale+.6,(north(y)-north(y+1))*METRES*sy+.6)
        }
      }
    }
    ctx.restore()
  }
  render(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw()})}
  private draw(){
    const canvas=this.canvas,w=canvas.clientWidth,h=canvas.clientHeight
    if(!w||!h)return
    const pixelRatio=Math.min(1.5,window.devicePixelRatio||1)
    if(canvas.width!==Math.round(w*pixelRatio)||canvas.height!==Math.round(h*pixelRatio)){
      canvas.width=Math.round(w*pixelRatio);canvas.height=Math.round(h*pixelRatio)
    }
    const ctx=canvas.getContext('2d')!
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0)
    const active=this.tracks[this.index], point=active?sample(active,active.length*this.progress):undefined
    if(this.mode==='overview' && this.tracks.length) {
      const b=this.bounds();this.center=[(b[0]+b[2])/2,(b[1]+b[3])/2]
    }else if(this.mode!=='free'&&point)this.center=[point.x,point.y]
    const s=this.scale(),iso=this.mode==='aerial'||this.mode==='overview'?0:0.54
    const sy=s*(1-iso*.47)
    const x0=w/2+(OSAKA[0]-this.center[0])*EAST_SCALE*s
    const y0=h/2-(OSAKA[1]-this.center[1])*METRES*sy
    const px=(lon:number)=>x0+(lon-OSAKA[0])*EAST_SCALE*s
    const py=(lat:number)=>y0-(lat-OSAKA[1])*METRES*sy
    ctx.fillStyle=this.elevation<0?'#152832':'#2b414a';ctx.fillRect(0,0,w,h)
    if(this.showMap&&this.overview.naturalWidth){
      ctx.drawImage(this.overview,px(122),py(47),px(148)-px(122),py(23)-py(47))
    }
    if(this.showMap)this.baseTiles(ctx,w,h,s,sy)
    if(this.showMap&&this.streets)ctx.drawImage(this.streets,x0-STREET_RANGE*s,y0-STREET_RANGE*sy,2*STREET_RANGE*s,2*STREET_RANGE*sy)
    if(this.showBuildings&&this.city&&s>.045) {
      for(const row of this.city.buildings) {
        const bx=x0+row[2]*s,by=y0-row[3]*sy
        if(bx< -250*s || bx>w+250*s || by< -250*s || by>h+250*s)continue
        const height=row[1]*s*iso
        ctx.fillStyle=this.elevation<0?'#33464e':'#41575e'
        ctx.beginPath()
        for(let i=2;i<row.length;i+=2){const x=x0+row[i]*s,y=y0-row[i+1]*sy;if(i===2)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
        ctx.closePath();ctx.fill()
        for(let i=2;i<row.length;i+=2){
          const j=i+2>=row.length?2:i+2
          const x=x0+row[i]*s,y=y0-row[i+1]*sy,xx=x0+row[j]*s,yy=y0-row[j+1]*sy
          if(xx>x)continue
          ctx.fillStyle=this.elevation<0?'#263b48':xx-x<yy-y?'#3f535f':'#4c6169'
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.lineTo(xx,yy-height);ctx.lineTo(x,y-height);ctx.closePath();ctx.fill()
        }
        const tone=Math.min(110,63+row[1]*.23)
        ctx.fillStyle=this.elevation<0?'#4a626d':`rgb(${tone+10},${tone+30},${tone+35})`
        ctx.beginPath()
        for(let i=2;i<row.length;i+=2){const x=x0+row[i]*s,y=y0-row[i+1]*sy-height;if(i===2)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
        ctx.closePath();ctx.fill()
      }
    }
    if(this.showRail)for(const item of this.traffic)for(const t of item.tracks){
      ctx.beginPath();t.coords.forEach(([x,y],j)=>{if(j)ctx.lineTo(px(x),py(y));else ctx.moveTo(px(x),py(y))})
      ctx.strokeStyle=item.color;ctx.globalAlpha=.65;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1
    }
    if(this.showRail)this.tracks.forEach((t,i)=>{
      ctx.beginPath();t.coords.forEach(([x,y],j)=>{if(j)ctx.lineTo(px(x),py(y));else ctx.moveTo(px(x),py(y))})
      ctx.strokeStyle=i<this.index?'#58847d':i===this.index?'#72f6ce':'#61a5ab';ctx.lineWidth=i===this.index?4:2;ctx.stroke()
    })
    this.marks=[]
    const named=new Set<string>()
    const label=(p:LngLat,name:string)=>{
      if(named.has(name))return;named.add(name)
      const x=px(p[0]),y=py(p[1])
      if(x<0||x>w||y<0||y>h||this.marks.some(m=>Math.hypot(x-m.x,y-m.y)<45))return
      this.marks.push({x,y,name});ctx.font='bold 14px sans-serif';ctx.lineWidth=4;ctx.strokeStyle='#20313a';ctx.fillStyle='#e7f4ef'
      ctx.strokeText(name,x+9,y-9);ctx.fillText(name,x+9,y-9)
      ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill()
    }
    for(const t of this.tracks){label(t.coords[0],t.from);label(t.coords.at(-1)!,t.to)}
    if(!active)label(OSAKA,'大阪')
    const train=(tracks:Track[],index:number,progress:number,color:string,label:string)=>{
      const t=tracks[index],distance=t.length*progress,spacing=t.kind==='shinkansen'?24.8:20.3
      const count=spacing*s>=5?4:1
      for(let i=count-1;i>=0;i--){
        const p=routePose(tracks,index,distance-spacing*i)
        const x=px(p.x),y=py(p.y)
        if(x< -40||y< -40||x>w+40||y>h+40)continue
        ctx.save();ctx.translate(x,y);ctx.rotate(p.heading-Math.PI/2)
        const length=count===1?16:spacing*s*.94,width=Math.max(3,3*s)
        ctx.fillStyle='#e3eff2'
        ctx.fillRect(-length/2,-width/2,length,width);ctx.fillStyle=color;ctx.fillRect(-length*.36,-width*.25,length*.72,width*.5)
        if(this.elevation<5&&i===0){ctx.fillStyle='#fff3c5';ctx.fillRect(length/2-2,-width/2,2,width)}
        if(this.elevation<5&&i===count-1){ctx.fillStyle='#ef6156';ctx.fillRect(-length/2,-width/2,2,width)}
        ctx.restore()
        if(i===0&&label){ctx.fillStyle=color;ctx.font='bold 12px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#14282e';ctx.strokeText(label,x+9,y+13);ctx.fillText(label,x+9,y+13)}
      }
    }
    for(const item of this.traffic)train(item.tracks,item.legIndex,item.progress,item.color,item.label)
    if(point)train(this.tracks,this.index,this.progress,'#66eac8','')
  }
  destroy(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.overview.onload=null;for(const image of this.tiles.values())image.onload=null;this.tiles.clear();this.canvas.remove()}
}
