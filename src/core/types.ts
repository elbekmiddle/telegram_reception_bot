import type { Context } from 'grammy'
export type Lang = 'uz'|'ru'
export type TxClient = { query<T=unknown>(sql:string, params?:unknown[]): Promise<{ rows:T[]; rowCount:number|null }> }
export type Queryable = { query<T=unknown>(sql:string, params?:unknown[]): Promise<{ rows:T[]; rowCount:number|null }>; tx?<T>(fn:(client:TxClient)=>Promise<T>): Promise<T> }
export type UserRecord = { id:string; telegramId:string; firstName:string|null; lastName:string|null; username:string|null; languageCode:Lang }
export type FlowSession = { userId:string; telegramId:string; flowType:'application'|'course'; step:string; payload:Record<string, unknown>; version:number; lastActivityAt:string; expiresAt:string }
export type AppContext = Context & { state:{ requestId:string; user?:UserRecord; lang?:Lang } }
