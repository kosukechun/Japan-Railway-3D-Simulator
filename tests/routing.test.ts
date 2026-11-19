import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDay, search, simulated, walk } from '../src/routing'
import type { Journey, Line, Network, Query, Step, Timetable } from '../src/types'

const read = <T>(name: string): T => JSON.parse(readFileSync('public/data/' + name + '.json', 'utf8'))
const n02 = read<Network>('network'), trams = read<Network>('okayama-network')
const network = {stations: [...n02.stations, ...trams.stations], lines: [...n02.lines, ...trams.lines]}
const table = read<Timetable>('timetable')
const cache = new Map<string, Step[]>()
function day(date: string) {
  if (!cache.has(date)) cache.set(date, buildDay(network, table, date))
  return cache.get(date)!
}
const base: Query = { from: '大阪', to: '京都', date: '2026-11-19', time: '09:00', mode: 'depart' }
function plan(args: Partial<Query>) {
  return search(network, table, {...base, ...args}, day).journeys
}
const rideIds = (j: Journey) => [...new Set(j.steps.filter(s => s.line !== walk).map(s => s.trip))]
function checkPath(j: Journey, via: string[] = []) {
  const stops = [j.steps[0].from, ...j.steps.map(s => s.to)]
  let next = 0
  for (const stop of stops) if (via[next] === stop) next++
  expect(next).toBe(via.length)
  expect(j.changes).toBe(rideIds(j).length - 1)
  j.steps.forEach((s, i) => {
    expect(s.arr).toBeGreaterThanOrEqual(s.dep)
    if (i) {
      expect(j.steps[i-1].to).toBe(s.from)
      expect(j.steps[i-1].arr).toBeLessThanOrEqual(s.dep)
    }
  })
}

describe('収録経路による時刻表検索', () => {
  it.each([
    ['大阪','京都'], ['大阪','神戸'], ['大阪','奈良'], ['大阪','和歌山'], ['大阪','姫路'],
    ['大阪','名古屋'], ['大阪','岡山'], ['大阪','広島'], ['大阪','高松'], ['京都','金沢'],
  ])('%sから%sまで経路・接続・発着時刻が連続する', (from, to) => {
    const choices = plan({from,to})
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.length).toBeLessThanOrEqual(3)
    choices.forEach(j => {
      checkPath(j)
      expect(j.steps[0].from).toBe(from)
      expect(j.steps.at(-1)?.to).toBe(to)
      expect(j.steps[0].dep).toBeGreaterThanOrEqual(540)
    })
  })
  it.each(['depart','arrive'] as const)('経由順を指定して同一便のまま移動できる (%s)', mode => {
    const via = ['新大阪','高槻']
    const j = plan({via, mode}).find(candidate => candidate.changes === 0)!
    expect(j).toBeDefined()
    checkPath(j, via)
    expect(rideIds(j)).toHaveLength(1)
    if (mode === 'arrive') expect(j.steps.at(-1)!.arr).toBeLessThanOrEqual(540)
  })
  it('公式烏丸線時刻表と東西線の乗換を経由条件にも使う', () => {
    const via = ['四条','烏丸御池']
    const j = plan({from:'京都',to:'東山（京都）',via})[0]
    checkPath(j, via)
    expect(j.steps.filter(s => s.line !== walk).every(s => s.source === 'kyoto-subway')).toBe(true)
    expect(j.changes).toBe(1)
    const transfer = j.steps.findIndex(s => s.line === 'kyoto-tozai')
    expect(j.steps[transfer].dep - j.steps[transfer-1].arr).toBeGreaterThanOrEqual(4)
  })
  it.each(['depart','arrive'] as const)('異なる駅の徒歩連絡とそこでの経由条件 (%s)', mode => {
    const via = ['岡山','岡山駅前']
    const j = plan({from:'新大阪',to:'清輝橋',via,mode})[0]
    checkPath(j, via)
    const transfer = j.steps.find(s => s.line === walk)!
    expect([transfer.from,transfer.to]).toEqual(via)
    expect(transfer.arr - transfer.dep).toBe(10)
    expect(j.steps.at(-1)?.source).toBe('okaden')
  })
  it('始発前の検索は前営業日の24時以降の列車にも乗車できる', () => {
    const j = plan({from:'新神戸',to:'西神中央',date:'2026-11-20',time:'00:31'})[0]
    expect(j.steps[0].dep).toBe(32)
    expect(j.steps.at(-1)?.arr).toBe(67)
    expect(j.steps[0].trip).toMatch(/^2026-11-19\/kobe-seishin-/)
    const reverse = plan({from:'新神戸',to:'西神中央',date:'2026-11-20',time:'01:07',mode:'arrive'})[0]
    expect(reverse.steps[0].trip).toBe(j.steps[0].trip)
  })
  it('同名駅の地下鉄と近鉄は異なる列車と位置で到着する', () => {
    const subway = plan({from:'京都',to:'十条'})[0], kintetsu = plan({from:'京都',to:'十条（近鉄）'})[0]
    expect(subway.steps.at(-1)?.line).toBe('karasuma')
    expect(kintetsu.steps.at(-1)?.line).toBe('kintetsu-local')
  })
  it('同一駅、未登録駅、存在しない日付、徒歩だけの区間を区別する', () => {
    expect(() => plan({to:'大阪'})).toThrow(/異なる駅/)
    expect(() => plan({via:['存在しない駅']})).toThrow(/候補/)
    expect(() => plan({date:'2026-02-30'})).toThrow(/日付/)
    expect(() => plan({from:'岡山',to:'岡山駅前'})).toThrow(/徒歩連絡/)
  })
  it('孤立駅や到達不能な経由駅に経路を生成しない', () => {
    const isolated: Network = {...network, stations:[...network.stations, {id:'孤立',name:'孤立',prefecture:'島根県',lon:133,lat:35}]}
    expect(search(isolated, table, {...base, to:'孤立'}, day).journeys).toEqual([])
    expect(search(isolated, table, {...base, via:['孤立']}, day).journeys).toEqual([])
  })
  it('大阪から京都へ新快速の代表所要時間に沿った推定便を出す', () => {
    const j = plan({}).find(candidate => candidate.steps.every(s => s.line === 'special-rapid'))!
    expect(j).toBeDefined()
    expect(j.steps.map(s => s.to)).toEqual(['新大阪','高槻','京都'])
    expect(j.steps.every(s => s.source === simulated)).toBe(true)
    const duration = j.steps.at(-1)!.arr - j.steps[0].dep
    expect(duration).toBeGreaterThanOrEqual(27)
    expect(duration).toBeLessThanOrEqual(32)
  })
})

describe('乗り換えの境界条件', () => {
  const stops = ['A','B','C','D','E']
  const line = (id: string, names: string[], operator: string): Line => ({
    id,name:id,operator,stops:names,kind:'jr',color:'#000000',segments:names.slice(1),distances:names.slice(1).map(() => 1),
  })
  const fixture: Network = {
    stations: stops.map(id => ({id,name:id,prefecture:'大阪府',lon:135,lat:35})),
    lines:[line('one',['A','B','C'],'甲'), line('two',['C','D','E'],'乙')],
  }
  const ride = (from:string,to:string,dep:number,arr:number,line:string,trip:string): Step =>
    ({from,to,dep,arr,line,trip,source:'official',destination:to})
  const edges = [
    ride('A','B',540,544,'one','a'), ride('B','C',544,550,'one','a'),
    ride('C','D',554,560,'two','too-early'), ride('D','E',560,565,'two','too-early'),
    ride('C','D',558,564,'two','valid'), ride('D','E',564,569,'two','valid'),
  ]
  for (const mode of ['depart','arrive'] as const) {
    it('経由指定でも会社間の8分を確保する ' + mode, () => {
      const q: Query = {...base, from:'A',to:'E',via:['B','C','D'],time:mode==='arrive'?'09:29':'09:00',mode}
      const j = search(fixture, {sources:[],calendars:{},trips:[]}, q, d => d === q.date ? edges : []).journeys[0]
      checkPath(j, q.via)
      expect(rideIds(j)).toEqual(['a','valid'])
    })
  }
  it('訪問順が逆なら途中から順序を読み替えない', () => {
    const q = {...base,from:'A',to:'E',via:['D','B']}
    expect(search(fixture, {sources:[],calendars:{},trips:[]}, q, d => d===q.date?edges:[]).journeys).toEqual([])
  })
})
