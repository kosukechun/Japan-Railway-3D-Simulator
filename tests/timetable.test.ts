import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDay, operating, stationBoard } from '../src/routing'
import type { Network, Timetable } from '../src/types'

const read = <T>(name: string): T => JSON.parse(readFileSync('public/data/'+name+'.json','utf8'))
const data = read<Timetable>('timetable')
const rail = read<Network>('network'), tram = read<Network>('okayama-network')
const network = {stations:[...rail.stations,...tram.stations],lines:[...rail.lines,...tram.lines]}

describe('公開データの運転日と列車時刻', () => {
  it('全列車の駅ID・時刻順・路線・出典・カレンダーが一致する', () => {
    const sources = new Set(data.sources.map(s => s.id))
    const lines = new Map(network.lines.map(l => [l.id,l]))
    const tripIds = new Set()
    for (const t of data.trips) {
      const line = lines.get(t.service)
      if (!line || !sources.has(t.source) || !data.calendars[t.calendar] || tripIds.has(t.id))
        throw new Error('列車ID・出典・運転日エラー ' + t.id)
      tripIds.add(t.id)
      if (t.stops.length < 2 || t.stops.length !== t.dep.length || t.stops.length !== t.arr.length)
        throw new Error('時刻の数が不正 ' + t.id)
      const ids = t.stops.map(s => line.stops.indexOf(s))
      for (let i=0; i<t.stops.length; i++) {
        if (ids[i] < 0 || (i>0 && Math.abs(ids[i]-ids[i-1]) !== 1))
          throw new Error('路線の停車順が不正 ' + t.id + ', ' + t.stops[i])
        if (t.arr[i] > t.dep[i] || (i>0 && t.dep[i-1] > t.arr[i])) throw new Error('時刻の逆転 ' + t.id)
      }
    }
    expect(sources.size).toBeGreaterThanOrEqual(4)
  })
  it('岡電の祝日は平日便を運休して休日便を追加する', () => {
    const holiday = '2026-11-23'
    expect(operating(data.calendars['okaden-0'], holiday)).toBe(false)
    expect(operating(data.calendars['okaden-1'], holiday)).toBe(true)
    expect(operating(data.calendars['okaden-0'],'2026-11-24')).toBe(true)
    // The timetable-less JR local model also uses its weekend interval on a public holiday.
    const departures = (date: string) => stationBoard(buildDay(network,data,date),'大阪')
      .filter(e => e.line==='kyoto-local' && e.destination==='京都').map(e => e.dep)
    const publicHoliday = departures(holiday), weekday = departures('2026-11-24')
    expect(publicHoliday[1]-publicHoliday[0]).toBe(15)
    expect(weekday[1]-weekday[0]).toBe(12)
  })
  it('神戸は公表済みの年末年始、京都は秋分日と振替休日に従う', () => {
    expect(operating(data.calendars['kobe-seishin-w'], '2025-12-29')).toBe(false)
    expect(operating(data.calendars['kobe-seishin-h'], '2025-12-29')).toBe(true)
    expect(operating(data.calendars['kyoto-subway-h'], '2026-09-22')).toBe(true)
    expect(operating(data.calendars['kyoto-subway-w'], '2026-09-23')).toBe(false)
  })
  it('改正後の海岸線・期限外の岡電に過去の実ダイヤを繰り返さない', () => {
    const before = buildDay(network, data, '2026-03-13')
    const after = buildDay(network, data, '2026-03-14')
    expect(before.some(e => e.source === 'kobe-kaigan')).toBe(true)
    expect(after.some(e => e.source === 'kobe-kaigan')).toBe(false)
    expect(after.some(e => e.source === 'okaden')).toBe(false)
  })
  it('新神戸の営業日時刻表に最終便24:32 → 西神中央を掲載', () => {
    const board = stationBoard(buildDay(network,data,'2026-11-19'),'新神戸')
    expect(board.some(e => e.line==='kobe-seishin' && e.source==='kobe-seishin' && e.dep===1472 && e.destination==='西神中央')).toBe(true)
    expect(board.map(e => e.dep)).toEqual([...board].map(e => e.dep).sort((a,b)=>a-b))
  })
  it('京都市の公表値と岡電GTFSの到着・発車を保持する', () => {
    const kyoto = data.trips.find(t => t.id==='kyoto-21114-1')!
    expect(kyoto.dep[kyoto.stops.indexOf('京都')]).toBe(327)
    expect(kyoto.arr.at(-1)).toBe(346)
    const through = stationBoard(buildDay(network,data,'2026-11-19'),'京都')
    expect(through.some(e => e.line === 'karasuma' && e.destination === '近鉄奈良')).toBe(true)
    const okayama = data.trips.find(t => t.id==='okaden-1001_0_00_001')!
    expect([okayama.stops[0],okayama.dep[0],okayama.stops.at(-1),okayama.arr.at(-1)]).toEqual(['岡山駅前',376,'東山',393])
  })
})
