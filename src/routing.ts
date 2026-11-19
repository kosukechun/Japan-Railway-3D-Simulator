import config from './settings.json'
import { dateOffset, minuteOf, weekday } from './time'
import type { BoardEntry, Calendar, Journey, Line, Network, Query, Result, Step, Timetable } from './types'

interface ServiceRule { first:number; last:number; every:number; weekend:number; speed:number; dwell:number; run?:number[] }
interface Link { step:Step; previous?:Link; rides:number }
const rules:Record<string,Partial<ServiceRule>> = config.lines
const stationTransfer:Record<string,number> = config.transfer.stations
export function operating(cal: Calendar, date: string) {
  if (cal.remove.includes(date)) return false
  if (cal.add.includes(date)) return true
  return date >= cal.start && date <= cal.end && cal.week.includes(weekday(date))
}
export const simulated = 'simulation'
export const walk = 'walk'

export function buildDay(net:Network, table:Timetable, date:string) {
  const edges:Step[] = []
  const actual = new Set(table.trips.map(t=>t.service))
  const calendars = new Set(Object.keys(table.calendars).filter(k=>operating(table.calendars[k], date)))
  const weekend = weekday(date) >= 6 || table.holidays?.includes(date)
  const insert = (line:string, id:string, stops:string[], arr:number[], dep:number[], source:string, destination=stops[stops.length-1]) => {
    for(let i=0;i+1<stops.length;i++) edges.push({from:stops[i],to:stops[i+1],dep:dep[i],arr:arr[i+1],trip:date+'/'+id,line,source,destination})
  }
  for(const t of table.trips) if(calendars.has(t.calendar)) insert(t.service,t.id,t.stops,t.arr,t.dep,t.source,t.headsign)
  for(const line of net.lines) {
    // Once a line has a published feed, its dates and service exceptions are authoritative.
    if(actual.has(line.id)) continue
    const rule = {...config.default,...rules[line.id]}
    const interval = weekend ? rule.weekend : rule.every
    const run = line.distances.map((km,i)=>rule.run?.[i] ?? Math.max(1,Math.round(km / rule.speed * 60)))
    for(const reverse of [false,true]) {
      const stops = reverse ? [...line.stops].reverse() : line.stops
      const durations = reverse ? [...run].reverse() : run
      for(let start=rule.first;start<=rule.last;start+=interval) {
        const arr = [start], dep = [start]
        for(const duration of durations) {
          arr.push(dep[dep.length-1]+duration)
          dep.push(arr[arr.length-1]+rule.dwell)
        }
        // Published-to-screen model precision is whole minutes at every station.
        insert(line.id,line.id+'/'+Number(reverse)+'/'+start,stops,arr.map(Math.round),dep.map(Math.round),simulated)
      }
    }
  }
  return edges
}

function transfer(station:string, a:Line, b:Line) {
  if(a.kind === 'shinkansen' || b.kind === 'shinkansen') return stationTransfer[station] ?? config.transfer.shinkansen
  return a.operator !== b.operator ? config.transfer.crossOperator : config.transfer.default
}
const footpaths = new Map<string, [string, number][]>()
for (const [a, b, minutes] of config.walks) {
  for (const [from, to] of [[String(a), String(b)], [String(b), String(a)]]) {
    const paths = footpaths.get(from) ?? []
    paths.push([to, Number(minutes)])
    footpaths.set(from, paths)
  }
}

function walking(from: string, to: string, dep: number, duration: number): Step {
  return { from, to, dep, arr: dep + duration, line: walk, trip: walk, source: simulated, destination: to }
}

/** A station timetable is keyed by operating day. 24:32 belongs to the selected day. */
export function stationBoard(edges: Step[], station: string): BoardEntry[] {
  return edges.filter(edge => edge.from === station)
    .map(({ dep, line, destination, source }) => ({ dep, line, destination, source }))
    .sort((a, b) => a.dep - b.dep)
}

function reconstruct(last: Link, reverse: boolean, lines: Map<string, Line>): Journey {
  const steps: Step[] = []
  for (let node: Link | undefined = last; node; node = node.previous) steps.push(node.step)
  if (!reverse) steps.reverse()
  let km = 0
  for (const step of steps) {
    const line = lines.get(step.line)
    if (!line) continue
    const a = line.stops.indexOf(step.from), b = line.stops.indexOf(step.to)
    km += line.distances.slice(Math.min(a,b), Math.max(a,b)).reduce((sum,v) => sum + v, 0)
  }
  return { steps, changes: last.rides - 1, km }
}

/**
 * Chronological connection scan. Each stage tracks how many of the ordered via
 * stops have been visited. An onboard label may advance to another stage
 * without boarding a new train. At a station, keep non-dominated time/rides
 * pairs per previous line because minimum transfer times depend on that line.
 */
function scan(edges: Step[], query: Query, lines: Map<string, Line>, excluded: Set<string>, findFew: boolean) {
  const reverse = query.mode === 'arrive'
  const sign = reverse ? -1 : 1
  const origin = reverse ? query.to : query.from
  const target = reverse ? query.from : query.to
  const time = minuteOf(query.time)
  const via = [...(query.via ?? [])]
  if (reverse) via.reverse()
  const at = (node: Link) => reverse ? node.step.dep : node.step.arr
  const nextStage = (stage: number, station: string) => {
    while (stage < via.length && via[stage] === station) stage++
    return stage
  }
  const firstStage = nextStage(0, origin)
  const stages = Array.from({length: via.length + 1}, () => new Map<string, Map<string, Link[]>>())
  const onboard = new Map<string, Map<number, Link>>()
  let fastest: Link | undefined
  let fewest: Link | undefined
  function update(station: string, lastLine: string, stage: number, node: Link) {
    if (station === target && stage === via.length) {
      if (!fastest || sign * (at(node)-at(fastest)) < 0 || (at(node) === at(fastest) && node.rides < fastest.rides)) fastest = node
      if (!fewest || node.rides < fewest.rides || (node.rides === fewest.rides && sign * (at(node)-at(fewest)) < 0)) fewest = node
    }
    let bucket = stages[stage].get(station)
    if (!bucket) stages[stage].set(station, bucket = new Map())
    const labels = bucket.get(lastLine)
    if (!labels) {
      bucket.set(lastLine, [node])
      return
    }
    const when = sign * at(node)
    if (labels.some(other => sign * at(other) <= when && other.rides <= node.rides)) return
    bucket.set(lastLine, [...labels.filter(other => sign * at(other) < when || other.rides < node.rides), node])
  }

  for (const edge of edges) {
    if (excluded.has(edge.line)) continue
    const start = reverse ? edge.to : edge.from
    const end = reverse ? edge.from : edge.to
    const leave = reverse ? edge.arr : edge.dep
    if (fastest && (!findFew || fastest.rides === 1) && sign * (leave - at(fastest)) > 0) break
    const previousOnboard = onboard.get(edge.trip)
    const nextOnboard = new Map<number, Link>()
    for (let stage = firstStage; stage <= via.length; stage++) {
      let previous = previousOnboard?.get(stage)
      let rides = previous?.rides ?? Infinity
      if (stage === firstStage && start === origin) {
        previous = undefined
        rides = 1
      } else if (rides > 1 && stage === nextStage(firstStage, start)) {
        // Walk from the origin in time to board this particular departure.
        const entrance = footpaths.get(start)?.find(([other]) => other === origin)
        if (entrance && sign * (leave-time) >= entrance[1]) {
          const minutes = entrance[1]
          previous = {step: reverse ? walking(start, origin, leave, minutes) : walking(origin, start, leave-minutes, minutes), rides: 0}
          rides = 1
        }
      }
      const bucket = stages[stage].get(start)
      if (bucket && rides > 1) {
        for (const [lastLine, labels] of bucket) {
          const buffer = lastLine === walk ? 0 : transfer(start, lines.get(lastLine)!, lines.get(edge.line)!)
          for (const candidate of labels) {
            if (candidate.rides + 1 < rides && sign * (leave-at(candidate)) >= buffer) {
              previous = candidate
              rides = candidate.rides + 1
            }
          }
        }
      }
      if (!Number.isFinite(rides)) continue
      const progress = nextStage(stage, end)
      const node: Link = {step: edge, previous, rides}
      const other = nextOnboard.get(progress)
      if (other && other.rides <= rides) continue
      nextOnboard.set(progress, node)
      update(end, edge.line, progress, node)
      for (const [destination, minutes] of footpaths.get(end) ?? []) {
        const step = reverse ? walking(destination, end, edge.dep-minutes, minutes) : walking(end, destination, edge.arr, minutes)
        update(destination, walk, nextStage(progress, destination), {step, previous: node, rides})
      }
    }
    if (nextOnboard.size) onboard.set(edge.trip, nextOnboard)
    else if (previousOnboard) onboard.delete(edge.trip)
  }
  return {fastest: fastest && reconstruct(fastest, reverse, lines), fewest: fewest && reconstruct(fewest, reverse, lines)}
}

export function search(net:Network, table:Timetable, q:Query, getDay=(d:string)=>buildDay(net,table,d)):Result {
  if (q.from === q.to) throw new Error('出発駅と到着駅に異なる駅を選んでください。')
  const requested = [q.from, ...(q.via ?? []), q.to]
  const valid = new Set(net.stations.map(s => s.id))
  if (!requested.every(id => valid.has(id))) throw new Error('出発駅・経由駅・到着駅を候補から選んでください。')
  if (requested.length === 2 && footpaths.get(q.from)?.some(([id]) => id === q.to))
    throw new Error('この区間は徒歩連絡です。列車を含む出発駅・到着駅を選んでください。')
  const day = Date.parse(q.date + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !Number.isFinite(day) || new Date(day).toISOString().slice(0,10) !== q.date
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(q.time)) throw new Error('有効な日付と時刻を入力してください。')
  const reverse = q.mode === 'arrive', minute = minuteOf(q.time)
  const low = reverse ? minute-1440 : minute, high = reverse ? minute : minute+1440
  const edges: Step[] = []
  const current = getDay(q.date)
  for (let offset=Math.floor(low/1440)-1; offset<=Math.floor(high/1440); offset++) {
    const dayEdges = offset === 0 ? current : getDay(dateOffset(q.date, offset))
    for (const edge of dayEdges) {
      const dep = edge.dep+offset*1440, arr = edge.arr+offset*1440
      if (dep >= low && arr <= high) edges.push(offset ? {...edge, dep, arr} : edge)
    }
  }
  // Stable source order keeps consecutive zero-minute GTFS edges in trip order.
  if (reverse) edges.reverse()
  edges.sort(reverse ? (a,b) => b.arr-a.arr || b.dep-a.dep : (a,b) => a.dep-b.dep || a.arr-b.arr)
  const lines = new Map(net.lines.map(l => [l.id, l]))
  const journeys: Journey[] = [], seen = new Set<string>()
  function add(candidate: Journey | undefined) {
    if (!candidate) return
    const key = JSON.stringify(candidate.steps.filter((s,i) => i === 0 || s.trip !== candidate.steps[i-1].trip).map(s => [s.from,s.line]))
    if (!seen.has(key)) { seen.add(key); journeys.push(candidate) }
  }
  const {fastest, fewest} = scan(edges, q, lines, new Set(), true)
  add(fastest)
  add(fewest)
  if (fastest) {
    const distinct = new Set(fastest.steps.filter(s => s.line !== walk).map(s => s.line))
    for (const line of distinct) add(scan(edges, q, lines, new Set([line]), false).fastest)
    if (journeys.length === 2 && distinct.size === 1) {
      const extra = journeys[1].steps.find(s => s.line !== walk && !distinct.has(s.line))
      if (extra) add(scan(edges, q, lines, new Set([...distinct, extra.line]), false).fastest)
    }
  }
  journeys.sort((a,b) => (reverse ? b.steps[0].dep-a.steps[0].dep : a.steps.at(-1)!.arr-b.steps.at(-1)!.arr) || a.changes-b.changes)
  return {journeys: journeys.slice(0,3), board: stationBoard(current, q.from)}
}
