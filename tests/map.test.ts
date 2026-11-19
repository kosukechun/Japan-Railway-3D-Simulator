import { describe, expect, it } from 'vitest'
import { track, routePose, solarElevation, type MapLeg } from '../src/map-math'

const leg:MapLeg={from:'A',to:'B',line:'線',kind:'jr',coords:[[135.49,34.70],[135.50,34.70]]}
const bend:MapLeg={...leg,from:'B',to:'C',coords:[[135.50,34.70],[135.50,34.71]]}
describe('地図上の走行と光',()=>{
  it('カーブの先頭と最後尾をそれぞれの線形に置く',()=>{
    const tracks=[track(leg),track(bend)]
    expect(routePose(tracks,1,15).x).toBeCloseTo(135.5,8)
    const last=routePose(tracks,1,15-3*20.3)
    expect(last.y).toBeCloseTo(34.70,8)
    expect(last.x).toBeLessThan(135.5)
    expect(routePose(tracks,1,tracks[1].length).y).toBeCloseTo(34.71,8)
  })
  it('乗換後は新しい線形の発車位置から編成を構成する',()=>{
    const last=routePose([track(leg),track({...bend,transfer:true})],1,-40)
    expect(last.x).toBeCloseTo(135.5,8)
    expect(last.y).toBeLessThan(34.70)
  })
  it('大阪の季節・時刻で太陽高度が変わる',()=>{
    const alt=(iso:string)=>solarElevation(Date.parse(iso+'+09:00'),135.5,34.7)
    expect(alt('2026-06-21T18:00')).toBeGreaterThan(6)
    expect(alt('2026-12-21T18:00')).toBeLessThan(-6)
    expect(alt('2026-11-19T12:00')).toBeGreaterThan(30)
    expect(alt('2026-11-19T00:00')).toBeLessThan(-30)
  })
})
