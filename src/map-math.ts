export type LngLat = [number, number]
export type TrainKind = 'jr' | 'private' | 'shinkansen' | 'subway' | 'express'
export type MapLeg = { coords: LngLat[]; from: string; to: string; line: string; kind: TrainKind; transfer?: boolean }
export type MapTraffic = {id:string;legs:MapLeg[];legIndex:number;progress:number;label:string;color:string}
export type TrafficPosition = {id:string;tracks:Track[];legIndex:number;progress:number;label:string;color:string}
export type Track = MapLeg & { distances: number[]; length: number }
export type CameraMode = 'follow' | 'aerial' | 'cab' | 'overview' | 'free'
export type LightMode = 'auto' | 'day' | 'sunset' | 'night'
export const OSAKA: LngLat = [135.4959, 34.7024]
const rad = Math.PI / 180
export function track(leg: MapLeg): Track {
  const distances = [0]
  for (let i = 1; i < leg.coords.length; i++) {
    const [x,y] = leg.coords[i-1], [nx,ny] = leg.coords[i]
    const dx = (nx-x)*Math.cos((y+ny)*rad/2)
    distances.push(distances[i-1]+111320*Math.hypot(dx,ny-y))
  }
  return { ...leg, distances, length: distances.at(-1) ?? 0 }
}
export function sample(t: Track, metres: number) {
  let lo=0, hi=t.distances.length-1
  while (lo+1<hi) {
    const mid=(lo+hi)>>>1
    if (t.distances[mid]<=metres) lo=mid
    else hi=mid
  }
  const a=t.coords[lo] ?? OSAKA, b=t.coords[hi] ?? a
  // Allow a short extension behind the departure platform for the trailing cars.
  const fraction=(metres-t.distances[lo])/(t.distances[hi]-t.distances[lo] || 1)
  return { x:a[0]+(b[0]-a[0])*fraction, y:a[1]+(b[1]-a[1])*fraction,
    heading:Math.atan2((b[0]-a[0])*Math.cos((a[1]+b[1])*rad/2),b[1]-a[1]) }
}
export function routePose(tracks:Track[],index:number,metres:number) {
  let t=tracks[index]
  while(metres<0 && index>0 && !t.transfer && tracks[index-1].to===t.from && tracks[index-1].line===t.line){
    t=tracks[--index];metres+=t.length
  }
  while(metres>t.length && index+1<tracks.length && !tracks[index+1].transfer && tracks[index+1].from===t.to && tracks[index+1].line===t.line) {
    metres-=t.length;t=tracks[++index]
  }
  return sample(t,metres)
}
export function solarElevation(time: number, lon: number, lat: number) {
  const days = time/86400000-10957.5
  const anomaly=(357.529+0.98560028*days)*rad
  const ecliptic=(280.459+0.98564736*days+1.915*Math.sin(anomaly)+0.020*Math.sin(2*anomaly))*rad
  const obliquity=(23.439-0.00000036*days)*rad
  const declination=Math.asin(Math.sin(obliquity)*Math.sin(ecliptic))
  const ascension=Math.atan2(Math.cos(obliquity)*Math.sin(ecliptic),Math.cos(ecliptic))
  const hour=(280.46061837+360.98564736629*days+lon)*rad-ascension
  return Math.asin(Math.sin(lat*rad)*Math.sin(declination)+Math.cos(lat*rad)*Math.cos(declination)*Math.cos(hour))/rad
}
export function lightHeight(mode: LightMode,time: number,lon: number,lat: number) {
  return mode==='day'?50:mode==='sunset'?2:mode==='night'?-24:solarElevation(time,lon,lat)
}
