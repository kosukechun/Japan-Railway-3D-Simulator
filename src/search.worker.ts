import { buildDay, search, stationBoard } from './routing'
import type { Network, Step, Timetable, WorkerRequest } from './types'

let network:Network, table:Timetable
const cache = new Map<string,Step[]>()
self.onmessage = ({data}:{data:WorkerRequest}) => {
  if('network' in data) { network=data.network; table=data.table; cache.clear(); return }
  function getDay(date:string) {
    let day=cache.get(date)
    if(!day) {
      if(cache.size>=4) cache.delete(cache.keys().next().value!)
      cache.set(date,day=buildDay(network,table,date))
    }
    return day
  }
  if('boardId' in data) {
    const board=stationBoard(getDay(data.date), data.station)
    self.postMessage({boardId:data.boardId,board})
    return
  }
  const {id,query}=data
  try {
    const result=search(network,table,query,getDay)
    self.postMessage({id,result})
  } catch(error) {self.postMessage({id,error:error instanceof Error ? error.message : '経路を検索できませんでした。'})}
}
