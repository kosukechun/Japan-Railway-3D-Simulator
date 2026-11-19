export type Kind = 'jr' | 'private' | 'subway' | 'express' | 'shinkansen'
export interface Station { id: string; name: string; prefecture: string; lon: number; lat: number }
export interface Line { id: string; name: string; operator: string; kind: Kind; color: string; stops: string[]; segments: string[]; distances: number[] }
export interface Network { stations: Station[]; lines: Line[] }
export interface Source { id: string; name: string; url: string; start?: string; end?: string; license?:string }
export interface Calendar { start: string; end: string; week: number[]; add: string[]; remove: string[] }
export interface Trip { id: string; service: string; calendar: string; source: string; headsign?: string; stops: string[]; arr: number[]; dep: number[] }
export interface Timetable { sources: Source[]; calendars: Record<string, Calendar>; trips: Trip[]; holidays?: string[] }
export interface Query { from: string; to: string; via?: string[]; date: string; time: string; mode: 'depart' | 'arrive' }
export interface Step { from: string; to: string; dep: number; arr: number; line: string; trip: string; source: string; destination: string }
export interface Journey { steps: Step[]; changes: number; km: number }
export interface TrafficJourney { id:string; journey:Journey; date:string; label:string; color:string }
export interface BoardEntry { dep: number; line: string; destination: string; source: string }
export interface Result { journeys: Journey[]; board: BoardEntry[] }
export type WorkerRequest = {network: Network; table: Timetable} | {query:Query; id:number} | {station:string; date:string; boardId:number}
