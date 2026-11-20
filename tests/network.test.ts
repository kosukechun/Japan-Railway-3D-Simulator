import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Line, Network } from '../src/types'

type Point = [number, number]
type Shapes = Record<string, Point[]>

const dataDir = join(process.cwd(), 'public', 'data')
const network: Network = JSON.parse(readFileSync(join(dataDir, 'network.json'), 'utf-8'))
const stationById = new Map(network.stations.map(station => [station.id, station]))
const lineById = new Map(network.lines.map(line => [line.id, line]))

function shapesOf(line: Line): Shapes {
  return JSON.parse(readFileSync(join(dataDir, 'shapes', line.id + '.json'), 'utf-8'))
}

function distance(a: Point, b: Point) {
  const lonScale = Math.cos((a[1] + b[1]) * Math.PI / 360)
  return 111.195 * Math.hypot((a[0] - b[0]) * lonScale, a[1] - b[1])
}

function stationPoint(id: string): Point {
  const station = stationById.get(id)
  if (!station) throw new Error('未登録の駅ID ' + id)
  return [station.lon, station.lat]
}

describe('国土数値情報の配布データ', () => {
  it('駅・列車系統のIDが一意で、全駅が都道府県と運転系統を持つ', () => {
    expect(stationById.size).toBe(network.stations.length)
    expect(lineById.size).toBe(network.lines.length)
    const served = new Set(network.lines.flatMap(line => line.stops))
    expect(served).toEqual(new Set(stationById.keys()))
    for (const station of network.stations) {
      expect(station.name.length).toBeGreaterThan(0)
      expect(station.prefecture).toMatch(/[都道府県]$/)
    }
  })

  it('京都の十条は別会社・別地点として選択できる', () => {
    expect(stationById.has('十条')).toBe(true)
    expect(stationById.has('十条（近鉄）')).toBe(true)
    expect(distance(stationPoint('十条'), stationPoint('十条（近鉄）'))).toBeGreaterThan(0.6)
    expect(lineById.get('karasuma')?.stops).toContain('十条')
    expect(lineById.get('kintetsu-local')?.stops).toContain('十条（近鉄）')
  })

  it('対象24府県すべてに旅客駅を収録する', () => {
    const covered = new Set(network.stations.map(station => station.prefecture))
    const target = [
      '大阪府','京都府','兵庫県','奈良県','和歌山県','三重県',
      '鳥取県','島根県','岡山県','広島県','山口県',
      '徳島県','香川県','愛媛県','高知県',
      '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県',
    ]
    for (const prefecture of target) {
      expect(covered.has(prefecture)).toBe(true)
    }
    const reachable = new Set(['大阪'])
    let count = -1
    while (count !== reachable.size) {
      count = reachable.size
      for (const line of network.lines) {
        if (line.stops.some(id => reachable.has(id))) {
          for (const stop of line.stops) reachable.add(stop)
        }
      }
    }
    const connected = new Set(network.stations.filter(station => reachable.has(station.id)).map(station => station.prefecture))
    for (const prefecture of target) expect(connected.has(prefecture)).toBe(true)
  })

  it.each(network.lines.map(line => [line.id, line] as const))('%s の区間形状・距離・駅端点・進行順が一致する', (_, line) => {
    const shapes = shapesOf(line)
    expect(new Set(line.stops).size).toBe(line.stops.length)
    expect(line.segments.length).toBe(line.stops.length - 1)
    expect(line.distances.length).toBe(line.segments.length)
    expect(new Set(Object.keys(shapes))).toEqual(new Set(line.segments))
    let previousEnd: Point | undefined
    line.segments.forEach((key, i) => {
      const points = shapes[key]
      expect(points.length).toBeGreaterThanOrEqual(2)
      let km = 0
      for (let j = 0; j < points.length; j++) {
        const point = points[j]
        if (!(point.length === 2 && point[0] > 122 && point[0] < 154 && point[1] > 20 && point[1] < 46)) {
          throw new Error(line.id + ' の座標異常 ' + point)
        }
        if (j > 0) km += distance(points[j - 1], point)
      }
      const first = points[0]
      const last = points[points.length - 1]
      expect(distance(first, stationPoint(line.stops[i]))).toBeLessThan(0.8)
      expect(distance(last, stationPoint(line.stops[i+1]))).toBeLessThan(0.8)
      expect(km).toBeGreaterThan(0)
      expect(Math.abs(km - line.distances[i])).toBeLessThan(0.00051)
      if (previousEnd) {
        if (line.id === 'kishuji' && line.stops[i] === '天王寺') {
          expect(distance(first, previousEnd)).toBeLessThan(0.13)
        } else if (line.id.startsWith('tosaden-') && line.stops[i] === 'はりまや橋') {
          expect(distance(first, previousEnd)).toBeLessThan(0.05)
        } else {
          expect(first).toEqual(previousEnd)
        }
      }
      previousEnd = last
    })
  })

  it('瀬戸大橋・湖西線を経由する系統は該当区間の線形を保持する', () => {
    const crossings: [string, string, Point, number][] = [
      ['marine', '児島', [133.808, 34.398], 1.3],
      ['thunderbird', '京都', [136.032, 35.398], 2],
    ]
    for (const [lineId, from, waypoint, radius] of crossings) {
      const line = lineById.get(lineId)!
      const shape = shapesOf(line)[line.segments[line.stops.indexOf(from)]]
      expect(shape.some(point => distance(point, waypoint) < radius)).toBe(true)
    }
  })

  it('指定の10経路が実線形の連なるネットワーク上に存在する', () => {
    const reachable = new Set(['大阪'])
    let count = -1
    while (count !== reachable.size) {
      count = reachable.size
      for (const line of network.lines) {
        if (line.stops.some(id => reachable.has(id))) {
          for (const stop of line.stops) reachable.add(stop)
        }
      }
    }
    for (const id of '京都 神戸 奈良 和歌山 姫路 名古屋 岡山 広島 高松 金沢'.split(' ')) {
      expect(reachable.has(id)).toBe(true)
    }
    expect(lineById.get('thunderbird')?.stops.at(-1)).toBe('敦賀')
    expect(lineById.get('hokuriku')?.stops[0]).toBe('敦賀')
  })

  it('追加した幹線・路面電車の停車順を保持する', () => {
    const expected = {
      'sanyo-local-west': ['門司', '下関'],
      kusatsu: ['草津', '柘植'],
      hankai: ['恵美須町', '浜寺駅前'],
      'hanshin-namba': ['大阪難波', '尼崎（阪神）'],
      'hiroshima-hakushima': ['白島', '八丁堀（広島）'],
      'toyama-tram-main': ['南富山駅前', '富山大学前'],
      'toyama-tram-port-university': ['岩瀬浜', '富山大学前'],
      'toyama-tram-loop': ['富山駅', '富山駅（環状線終着）'],
      'tosaden-ino-gomen': ['伊野', '後免町'],
      'tosaden-ino-sambashi': ['伊野', '桟橋通五丁目'],
      'tosaden-gomen-sambashi': ['桟橋通五丁目', '後免町'],
      'tosaden-station-ino': ['高知駅前', '伊野'],
      'tosaden-station-sambashi': ['高知駅前', '桟橋通五丁目'],
      'toyohashi-atsumi': ['新豊橋', '三河田原'],
      'toyohashi-azumada-akarock': ['駅前', '赤岩口'],
      'toyohashi-azumada-undokoen': ['駅前', '運動公園前'],
    }
    for (const [id, endpoints] of Object.entries(expected)) {
      const line = lineById.get(id)
      expect(line).toBeDefined()
      expect(line?.stops[0]).toBe(endpoints[0])
      expect(line?.stops.at(-1)).toBe(endpoints[1])
      expect(line?.stops.length).toBeGreaterThanOrEqual(2)
    }
  })
})
