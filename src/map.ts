import * as C from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { CanvasMap, EAST_SCALE, STREET_RANGE, readLocal, streetImage, cutStationRoofs, type RailContext, type City } from './local-map'
import { cityTransform, osakaMesh } from './osaka-mesh'
import { OSAKA, lightHeight, sample, routePose, track, type Track, type MapLeg, type LightMode, type TrainKind, type CameraMode, type MapTraffic, type TrafficPosition } from './map-math'
export type {MapLeg,CameraMode,LightMode,TrainKind,MapTraffic} from './map-math'
type Options={onStatus?:(message:string)=>void;onStation?:(name:string)=>void}
type Layers={buildings:boolean;imagery:boolean;rail:boolean}
type Vehicle={kind:TrainKind;cars:C.Entity[];marker:C.Entity}
type TrafficLayer={state:TrafficPosition;vehicle?:Vehicle;paths:C.Entity[]}
const css=C.Color.fromCssColorString
const TO_RAD=Math.PI/180
const terrainUrl='https://tile.plateauview.mlit.go.jp/terrain/'
const buildingsUrl='https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-lod1-latest/tileset.json'
const clamp=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x))
const railColors=['#578f88','#56edbf','#67aab7']

export class RailwayMap {
  private viewer?:C.Viewer
  private flat?:CanvasMap
  private tracks:Track[]=[]
  private paths:C.Entity[]=[]
  private stationEntities:C.Entity[]=[]
  private vehicle?:Vehicle
  private traffic=new Map<string,TrafficLayer>()
  private trackCache=new WeakMap<MapLeg[],Track[]>()
  private travelled?:C.Entity
  private stationNames=new Map<string,string>()
  private city?:City
  private streets?:HTMLCanvasElement
  private localMesh?:C.Primitive
  private localLayer?:C.ImageryLayer
  private nationLayer?:C.ImageryLayer
  private imagery?:C.ImageryLayer
  private tileset?:C.Cesium3DTileset
  private loadingTiles=false
  private terrainReady=false
  private shader?:C.CustomShader
  private stop=new AbortController()
  private credits:HTMLElement
  private host:HTMLElement
  private layers:Layers={buildings:true,imagery:true,rail:true}
  private mode:CameraMode='follow'
  private light:LightMode='auto'
  private range=540
  private angle=34
  private active=0
  private fraction=0
  private lastDrawn=-1
  private time=Date.now()
  private heading?:number
  private lastLight=NaN
  private lastIssue=''
  private lastIssueAt=0
  constructor(container:HTMLElement,private options:Options={}) {
    this.host=document.createElement('div')
    this.host.style.cssText='position:absolute;inset:0;overflow:hidden;background:#273e49'
    container.append(this.host)
    this.credits=document.createElement('div')
    this.credits.className='rail-map-credit'
    this.credits.style.cssText='position:absolute;left:5px;bottom:4px;max-width:95%;font:11px/1.4 sans-serif;background:#162731db;color:#e2ecee;padding:2px 5px;border-radius:3px;z-index:1'
    for(const [title,url] of [['地理院タイル','https://maps.gsi.go.jp/development/ichiran.html'],['PLATEAU','https://www.mlit.go.jp/plateau/'],['Mapterhorn','https://mapterhorn.com/'],['国土地理院','https://www.gsi.go.jp/'],['© OpenStreetMap contributors','https://www.openstreetmap.org/copyright']]){
      if(this.credits.childNodes.length)this.credits.append(' | ')
      const a=document.createElement('a');a.textContent=title;a.href=url;a.target='_blank';a.rel='noopener';a.style.color='inherit';this.credits.append(a)
    }
    try{this.initGl()}catch{this.useCanvas()}
    container.append(this.credits)
    void this.loadLocal()
  }
  private status(message:string) {if(!this.stop.signal.aborted)this.options.onStatus?.(message)}
  private issue(message:string){
    this.lastIssue=message;this.lastIssueAt=performance.now();this.status(message)
  }
  private initGl(){
    const v=this.viewer=new C.Viewer(this.host,{
      baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,navigationHelpButton:false,
      sceneModePicker:false,selectionIndicator:false,infoBox:false,fullscreenButton:false,
      animation:false,timeline:false,shouldAnimate:false,scene3DOnly:true,shadows:true,
      requestRenderMode:true,maximumRenderTimeChange:Infinity,
      contextOptions:{webgl:{alpha:false,antialias:true}},useBrowserRecommendedResolution:true,
    })
    v.resolutionScale=Math.min(1.45,window.devicePixelRatio||1)
    v.scene.globe.baseColor=css('#304650');v.scene.globe.enableLighting=true
    v.scene.globe.depthTestAgainstTerrain=true
    v.scene.globe.maximumScreenSpaceError=2.5
    v.scene.screenSpaceCameraController.minimumZoomDistance=4
    v.shadowMap.maximumDistance=2200
    v.scene.globe.shadows=C.ShadowMode.RECEIVE_ONLY
    v.scene.renderError.addEventListener(()=>{queueMicrotask(()=>this.useCanvas())})
    const provider=new C.UrlTemplateImageryProvider({url:'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
      maximumLevel:18,rectangle:C.Rectangle.fromDegrees(122,20,154,46),
      credit:new C.Credit('Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.')})
    provider.errorEvent.addEventListener((err:C.TileProviderError)=>{
      err.retry=false
      if(performance.now()-this.lastIssueAt>8000||!this.lastIssue)this.issue('背景タイルを取得できない範囲は簡易地図で表示します')
    })
    this.imagery=v.imageryLayers.addImageryProvider(provider)
    this.imagery.saturation=.5
    this.shader=new C.CustomShader({uniforms:{u_lamps:{type:C.UniformType.FLOAT,value:0}},
      fragmentShaderText:'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.emissive *= u_lamps; }'})
    v.scene.globe.tileLoadProgressEvent.addEventListener((n:number)=>{
      if(performance.now()-this.lastIssueAt>6500||!this.lastIssue)this.status(n?'地図を読み込み中':'地図を表示中')
      if(!n){this.alignCity();this.refresh()}
    })
    v.scene.camera.moveEnd.addEventListener(()=>{this.syncBuildings();this.placeLabels()})
    v.screenSpaceEventHandler.setInputAction((e:{position:C.Cartesian2})=>{
      const hit=v.scene.pick(e.position)?.id
      if(hit instanceof C.Entity){const name=this.stationNames.get(hit.id);if(name)this.options.onStation?.(name)}
    },C.ScreenSpaceEventType.LEFT_CLICK)
    v.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    this.lookAt(C.Cartesian3.fromDegrees(...OSAKA,15),32*TO_RAD,-34*TO_RAD,1550)
    this.lightScene(this.time,...OSAKA)
    void C.CesiumTerrainProvider.fromUrl(terrainUrl,{requestVertexNormals:true}).then(terrain=>{
      if(this.viewer!==v)return
      terrain.errorEvent.addEventListener((err:C.TileProviderError)=>{err.retry=false})
      v.terrainProvider=terrain;this.terrainReady=true;v.scene.requestRender()
    }).catch(()=>this.issue('地形配信に接続できないため、標高を簡略化しています'))
  }
  private async loadLocal(){
    const signal=this.stop.signal
    const context=readLocal<RailContext>('osaka-track-context.json',signal)
    await Promise.allSettled([
      Promise.all([readLocal<City>('osaka-buildings.json',signal),context]).then(([data,rail])=>{
        if(signal.aborted)return
        this.city=cutStationRoofs(data,rail)
        // Back-to-front for the canvas oblique view.
        data.buildings.sort((a,b)=>b[3]-a[3])
        if(this.flat){this.flat.city=data;this.flat.render()}
        if(this.viewer){
          this.localMesh=this.viewer.scene.primitives.add(osakaMesh(data))
          this.alignCity();this.syncLayers()
        }
      }),
      context.then(rail=>streetImage(signal,rail)).then(async image=>{
        if(signal.aborted)return
        this.streets=image
        if(this.flat){this.flat.streets=image;this.flat.render()}
        const v=this.viewer
        if(!v)return
        const dx=STREET_RANGE/EAST_SCALE,dy=STREET_RANGE/111320
        const provider=await C.SingleTileImageryProvider.fromUrl(image.toDataURL('image/png'),{
          rectangle:C.Rectangle.fromDegrees(OSAKA[0]-dx,OSAKA[1]-dy,OSAKA[0]+dx,OSAKA[1]+dy)})
        if(this.viewer!==v)return
        this.localLayer=v.imageryLayers.addImageryProvider(provider,this.imagery?v.imageryLayers.indexOf(this.imagery):0)
        this.syncLayers()
      }),
      (async()=>{
        const v=this.viewer
        if(!v)return
        const provider=await C.SingleTileImageryProvider.fromUrl(import.meta.env.BASE_URL+'data/japan-overview.webp',{
          rectangle:C.Rectangle.fromDegrees(122,23,148,47)})
        if(this.viewer!==v)return
        this.nationLayer=v.imageryLayers.addImageryProvider(provider,0);this.syncLayers()
      })(),
    ])
  }
  private alignCity(){
    const v=this.viewer
    if(!v||!this.localMesh)return
    const h=this.terrainReady?v.scene.globe.getHeight(C.Cartographic.fromDegrees(...OSAKA))??0:0
    this.localMesh.modelMatrix=cityTransform(h)
  }
  private useCanvas(){
    if(this.flat||this.stop.signal.aborted)return
    this.viewer?.destroy();this.viewer=undefined
    this.host.replaceChildren()
    const flat=this.flat=new CanvasMap(this.host,this.options.onStation)
    flat.city=this.city;flat.streets=this.streets;flat.tracks=this.tracks;flat.mode=this.mode;flat.range=this.range
    flat.traffic=Array.from(this.traffic.values(),layer=>layer.state)
    this.issue('WebGL が利用できないため簡易地図を表示しています')
    this.syncLayers();this.refresh()
  }
  private async streamBuildings(){
    const v=this.viewer
    if(!v||this.tileset||this.loadingTiles||!this.layers.buildings)return
    this.loadingTiles=true
    try{
      const tiles=await C.Cesium3DTileset.fromUrl(buildingsUrl,{maximumScreenSpaceError:20,cacheBytes:48*1024*1024,
        maximumCacheOverflowBytes:32*1024*1024,shadows:C.ShadowMode.ENABLED})
      if(this.viewer!==v){tiles.destroy();return}
      tiles.style=new C.Cesium3DTileStyle({color:'color("#98b0b8")'})
      tiles.tileFailed.addEventListener(()=>this.issue('一部の建物タイルを取得できませんでした'))
      this.tileset=v.scene.primitives.add(tiles);this.syncLayers()
    }catch{this.issue('建物配信に接続できないため、収録済みの地物を表示します')}
  }
  private lookAt(target:C.Cartesian3,heading:number,pitch:number,range:number){
    const camera=this.viewer?.camera
    if(!camera)return
    camera.lookAt(target,new C.HeadingPitchRange(heading,pitch,range))
    camera.lookAtTransform(C.Matrix4.IDENTITY)
  }
  private mark(name:string,x:number,y:number,important:boolean){
    const v=this.viewer!
    const e=v.entities.add({position:C.Cartesian3.fromDegrees(x,y),point:{
      pixelSize:important?10:6,color:important?css('#ffc776'):C.Color.WHITE,outlineColor:css('#183e42'),outlineWidth:2,
      heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity},
      label:{text:name,font:'bold 14px sans-serif',fillColor:C.Color.WHITE,outlineColor:css('#1d2f36'),
        outlineWidth:4,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-17),
        heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity,
        distanceDisplayCondition:new C.DistanceDisplayCondition(0,important?2500000:25000)}})
    this.stationNames.set(e.id,name);this.stationEntities.push(e)
  }
  setRoute(legs:MapLeg[]){
    this.tracks=legs.filter(t=>t.coords.length>=2).map(track)
    this.fraction=0;this.active=0;this.lastDrawn=-1;this.heading=undefined
    if(this.flat){this.flat.tracks=this.tracks;this.refresh();return}
    const v=this.viewer
    if(!v)return
    for(const e of [...this.paths,...this.stationEntities])v.entities.remove(e)
    if(this.travelled)v.entities.remove(this.travelled)
    this.paths=[];this.stationEntities=[];this.stationNames.clear()
    const seen=new Set<string>()
    this.tracks.forEach((t,i)=>{
      const positions=C.Cartesian3.fromDegreesArray(t.coords.flat())
      const e=v.entities.add({name:t.line,polyline:{positions,width:4,material:css(railColors[2]),clampToGround:true,
        classificationType:C.ClassificationType.TERRAIN,zIndex:1}})
      this.paths.push(e)
      if(!seen.has(t.from)){this.mark(t.from,...t.coords[0],i===0||!!t.transfer);seen.add(t.from)}
      if(i===this.tracks.length-1&&!seen.has(t.to))this.mark(t.to,...t.coords.at(-1)!,true)
    })
    this.travelled=v.entities.add({polyline:{positions:[],width:4.5,material:css(railColors[0]),clampToGround:true,
      classificationType:C.ClassificationType.TERRAIN,zIndex:2}})
    if(!this.tracks.length){this.removeVehicle(this.vehicle);this.vehicle=undefined}
    if(this.mode==='overview')this.overview()
    this.colorPaths();this.syncLayers();this.refresh()
  }
  private colorPaths(){
    this.paths.forEach((e,i)=>{if(e.polyline)e.polyline.material=new C.ColorMaterialProperty(css(railColors[i<this.active?0:i===this.active?1:2]))})
  }
  private removeVehicle(vehicle?:Vehicle){
    if(!vehicle||!this.viewer)return
    for(const car of vehicle.cars)this.viewer.entities.remove(car)
    this.viewer.entities.remove(vehicle.marker)
  }
  private buildCars(kind:TrainKind,color:string):Vehicle{
    const v=this.viewer!
    const cars=Array.from({length:4},(_,i)=>v.entities.add({
      position:new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(...OSAKA)),
      orientation:new C.ConstantProperty(C.Quaternion.IDENTITY),
      model:{uri:import.meta.env.BASE_URL+'models/'+kind+(i===0?'-cab':i===3?'-tail':'-car')+'.glb',
        customShader:this.shader,shadows:C.ShadowMode.ENABLED,distanceDisplayCondition:new C.DistanceDisplayCondition(0,3200)},
    }))
    const marker=v.entities.add({position:new C.ConstantPositionProperty(C.Cartesian3.fromDegrees(...OSAKA)),point:{
      pixelSize:10,color:css(color),outlineWidth:2,outlineColor:C.Color.WHITE,disableDepthTestDistance:Infinity,
      distanceDisplayCondition:new C.DistanceDisplayCondition(500,2500000)},
      label:{text:'',font:'bold 14px sans-serif',showBackground:true,backgroundColor:css('#153c40').withAlpha(.88),
        pixelOffset:new C.Cartesian2(0,25),disableDepthTestDistance:Infinity,
        distanceDisplayCondition:new C.DistanceDisplayCondition(450,80000)}})
    return {kind,cars,marker}
  }
  private positionVehicle(vehicle:Vehicle,tracks:Track[],index:number,metres:number,label:string,cab:boolean){
    const v=this.viewer!,t=tracks[index],spacing=t.kind==='shinkansen'?24.8:20.3
    const altitude=(x:number,y:number)=>v.scene.globe.getHeight(C.Cartographic.fromDegrees(x,y))??0
    let tangent=0,location=C.Cartesian3.ZERO
    for(let i=0;i<vehicle.cars.length;i++){
      const car=vehicle.cars[i],offset=metres-i*spacing
      const p=routePose(tracks,index,offset),back=routePose(tracks,index,offset-4),front=routePose(tracks,index,offset+4)
      const dir=Math.atan2((front.x-back.x)*Math.cos(p.y*TO_RAD),front.y-back.y)
      const pos=C.Cartesian3.fromDegrees(p.x,p.y,altitude(p.x,p.y)+.45)
      car.show=!cab||i!==0
      ;(car.position as C.ConstantPositionProperty).setValue(pos)
      ;(car.orientation as C.ConstantProperty).setValue(C.Transforms.headingPitchRollQuaternion(pos,new C.HeadingPitchRoll(dir-Math.PI/2+(i===3?Math.PI:0),0,0)))
      if(i===0){tangent=dir;location=pos}
    }
    const marker=vehicle.marker
    ;(marker.position as C.ConstantPositionProperty).setValue(location)
    if(marker.label && marker.label.text?.getValue(v.clock.currentTime)!==label)marker.label.text=new C.ConstantProperty(label)
    return {location,tangent}
  }
  private placeLabels(){
    const v=this.viewer
    if(!v)return
    const boxes:{x:number;y:number;width:number}[]=[]
    for(const vehicle of [this.vehicle,...Array.from(this.traffic.values(),layer=>layer.vehicle)]){
      const label=vehicle?.marker.label,pos=vehicle?.marker.position?.getValue(v.clock.currentTime)
      if(!pos||!label)continue
      const screen=v.scene.cartesianToCanvasCoordinates(pos)
      if(!screen)continue
      const title=String(label.text?.getValue(v.clock.currentTime)??''),width=Math.max(65,title.length*13)
      let offset=25
      while(boxes.some(box=>Math.abs(box.x-screen.x)<(box.width+width)/2+6&&Math.abs(box.y-screen.y-offset)<22))offset+=22
      const old=label.pixelOffset?.getValue(v.clock.currentTime)
      if(old?.y!==offset)label.pixelOffset=new C.ConstantProperty(new C.Cartesian2(0,offset))
      boxes.push({x:screen.x,y:screen.y+offset,width})
    }
  }
  setTraffic(items:MapTraffic[]){
    const present=new Set<string>()
    let boundsChanged=false
    for(const item of items){
      let tracks=this.trackCache.get(item.legs)
      if(!tracks){
        tracks=item.legs.filter(t=>t.coords.length>=2).map(track)
        this.trackCache.set(item.legs,tracks)
      }
      if(!tracks.length)continue
      const index=clamp(Math.trunc(item.legIndex),0,tracks.length-1)
      const state={id:item.id,tracks,legIndex:index,progress:clamp(item.progress,0,1),label:item.label,color:item.color}
      const old=this.traffic.get(item.id)
      const layer=old??{state,paths:[]}
      if(!old||old.state.tracks!==tracks||old.state.color!==item.color){
        boundsChanged=true
        if(this.viewer){
          for(const p of layer.paths)this.viewer.entities.remove(p)
          layer.paths=tracks.map(t=>this.viewer!.entities.add({show:this.layers.rail,polyline:{
            positions:C.Cartesian3.fromDegreesArray(t.coords.flat()),clampToGround:true,width:2,
            classificationType:C.ClassificationType.TERRAIN,material:css(item.color).withAlpha(.62),zIndex:0}}))
        }
        if(old&&old.state.color!==item.color){this.removeVehicle(layer.vehicle);layer.vehicle=undefined}
      }
      layer.state=state;present.add(item.id);this.traffic.set(item.id,layer)
      if(this.viewer){
        const t=tracks[index]
        if(layer.vehicle?.kind!==t.kind){this.removeVehicle(layer.vehicle);layer.vehicle=this.buildCars(t.kind,item.color)}
        this.positionVehicle(layer.vehicle,tracks,index,t.length*state.progress,item.label,false)
      }
    }
    for(const [id,layer] of this.traffic)if(!present.has(id)){
      this.removeVehicle(layer.vehicle)
      for(const p of layer.paths)this.viewer?.entities.remove(p)
      this.traffic.delete(id);boundsChanged=true
    }
    if(this.flat){this.flat.traffic=Array.from(this.traffic.values(),layer=>layer.state);this.flat.render()}
    if(boundsChanged&&this.mode==='overview')this.overview()
    this.placeLabels()
    this.viewer?.scene.requestRender()
  }
  update(legIndex:number,progress:number,timeMs:number){
    const index=clamp(Math.floor(legIndex),0,Math.max(0,this.tracks.length-1))
    if(index!==this.active){this.active=index;this.lastDrawn=-1;this.colorPaths()}
    this.fraction=clamp(progress,0,1);this.time=timeMs;this.refresh()
  }
  private refresh(){
    const t=this.tracks[this.active],metres=t?t.length*this.fraction:0
    const p=t?sample(t,metres):{x:OSAKA[0],y:OSAKA[1],heading:0}
    if(this.flat){
      this.flat.progress=this.fraction;this.flat.index=this.active
      this.flat.elevation=lightHeight(this.light,this.time,p.x,p.y);this.flat.render();return
    }
    const v=this.viewer
    if(!v)return
    this.lightScene(this.time,p.x,p.y)
    if(t){
      if(this.vehicle?.kind!==t.kind){this.removeVehicle(this.vehicle);this.vehicle=this.buildCars(t.kind,'#48edb1')}
      const spacing=t.kind==='shinkansen'?24.8:20.3
      const {location,tangent}=this.positionVehicle(this.vehicle,this.tracks,this.active,metres,t.line,this.mode==='cab')
      if(this.travelled?.polyline && (Math.abs(this.fraction-this.lastDrawn)>.008||this.fraction===1&&this.lastDrawn!==1)){
        let i=0;while(i<t.distances.length&&t.distances[i]<metres)i++
        const coords=t.coords.slice(0,i);coords.push([p.x,p.y])
        this.travelled.polyline.positions=new C.ConstantProperty(coords.length>1?C.Cartesian3.fromDegreesArray(coords.flat()):[])
        this.lastDrawn=this.fraction
      }
      const angle=this.heading===undefined?tangent:this.heading+.26*Math.atan2(Math.sin(tangent-this.heading),Math.cos(tangent-this.heading))
      this.heading=angle
      if(this.mode==='follow')this.lookAt(location,angle,-this.angle*TO_RAD,this.range)
      if(this.mode==='aerial')this.lookAt(location,0,-Math.PI/2,Math.max(900,this.range*2.5))
      if(this.mode==='cab'){
        const q=routePose(this.tracks,this.active,metres+spacing*.5)
        const height=v.scene.globe.getHeight(C.Cartographic.fromDegrees(q.x,q.y))??0
        v.camera.setView({destination:C.Cartesian3.fromDegrees(q.x,q.y,height+4.2),orientation:{heading:angle,pitch:-.035,roll:0}})
      }
    }
    this.syncBuildings();this.placeLabels();v.scene.requestRender()
  }
  private syncBuildings(){
    const v=this.viewer
    if(!v)return
    const loc=v.camera.positionCartographic,lon=loc.longitude/TO_RAD,lat=loc.latitude/TO_RAD
    const near=Math.abs(lon-OSAKA[0])<.018&&Math.abs(lat-OSAKA[1])<.014&&loc.height<4000
    if(this.localMesh)this.localMesh.show=this.layers.buildings&&(near||!this.tileset)
    if(this.tileset)this.tileset.show=this.layers.buildings&&(!near||!this.localMesh)
    if(!near&&loc.height<20000&&this.layers.buildings)void this.streamBuildings()
  }
  private lightScene(time:number,x:number,y:number){
    const v=this.viewer!
    const elev=lightHeight(this.light,time,x,y)
    // Fixed modes use a representative lighting clock. The simulation clock remains unchanged.
    const day=Math.floor((time+9*3600000)/86400000)*86400000-9*3600000
    const litTime=this.light==='auto'?time:day+({day:12,sunset:17.4,night:22}[this.light])*3600000
    v.clock.currentTime=C.JulianDate.fromDate(new Date(litTime))
    if(Number.isFinite(this.lastLight)&&Math.abs(this.lastLight-elev)<.25)return
    this.lastLight=elev
    const daylight=clamp((elev+10)/28,0,1),warm=Math.max(0,1-Math.abs(elev-2)/12)
    if(this.imagery){this.imagery.brightness=.62+daylight*.26;this.imagery.gamma=1.18}
    if(this.localLayer)this.localLayer.brightness=.80+daylight*.22
    if(v.scene.skyAtmosphere){
      v.scene.skyAtmosphere.hueShift=-.13*warm;v.scene.skyAtmosphere.saturationShift=.33*warm
      v.scene.skyAtmosphere.brightnessShift=-.24*(1-daylight)
    }
    v.scene.light=new C.SunLight({color:new C.Color(1,1-.22*warm,1-.39*warm),intensity:1.45+daylight*.65})
    this.shader?.setUniform('u_lamps',clamp((8-elev)/10,0,1))
  }
  private overview(){
    if(!this.viewer||!this.tracks.length)return
    const coords=[...this.tracks,...Array.from(this.traffic.values()).flatMap(v=>v.state.tracks)].flatMap(t=>t.coords)
    const sphere=C.BoundingSphere.fromPoints(C.Cartesian3.fromDegreesArray(coords.flat()))
    this.lookAt(sphere.center,0,-1.43,Math.max(500,sphere.radius*2.75))
  }
  setCamera(mode:CameraMode){
    this.mode=mode;this.heading=undefined
    if(this.flat){this.flat.mode=mode;this.flat.zoom=1}
    if(mode==='overview')this.overview()
    this.refresh()
  }
  setCameraOptions(distanceMeters:number,angleDegrees:number){
    this.range=clamp(distanceMeters,30,10000);this.angle=clamp(angleDegrees,5,88)
    if(this.flat)this.flat.range=this.range
    this.refresh()
  }
  setLight(mode:LightMode){this.light=mode;this.lastLight=NaN;this.refresh()}
  setLayers(layers:Partial<Layers>){Object.assign(this.layers,layers);this.syncLayers()}
  private syncLayers(){
    if(this.flat){this.flat.showBuildings=this.layers.buildings;this.flat.showMap=this.layers.imagery;this.flat.showRail=this.layers.rail;this.flat.render()}
    if(this.imagery)this.imagery.show=this.layers.imagery
    if(this.localLayer)this.localLayer.show=this.layers.imagery
    if(this.nationLayer)this.nationLayer.show=this.layers.imagery
    for(const e of [...this.paths,...this.stationEntities])e.show=this.layers.rail
    for(const layer of this.traffic.values())for(const e of layer.paths)e.show=this.layers.rail
    if(this.travelled)this.travelled.show=this.layers.rail
    this.syncBuildings();this.viewer?.scene.requestRender()
  }
  destroy(){
    this.stop.abort();this.flat?.destroy()
    this.viewer?.destroy();this.viewer=undefined
    // Cesium 1.121 omits these public lifecycle methods from CustomShader's declaration.
    const shader=this.shader as (C.CustomShader & {isDestroyed():boolean;destroy():void})|undefined
    if(shader&&!shader.isDestroyed())shader.destroy()
    this.traffic.clear()
    this.host.remove();this.credits.remove()
  }
}
