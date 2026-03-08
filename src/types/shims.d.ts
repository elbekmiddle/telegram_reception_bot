declare module 'grammy' {
  export type Middleware<T = any> = (ctx: T, next: () => Promise<void>) => any
  export type MiddlewareFn<T = any> = Middleware<T>
  export type SessionFlavor<T = any> = { session: T }
  export class Context {
    [key: string]: any
  }
  export class Bot<T = any, A = any, R = any> {
    constructor(token: string)
    [key: string]: any
  }
  export class InlineKeyboard {
    text(text: string, data: string): this
    row(): this
  }
  export class Keyboard {
    requestContact(text: string): this
    text(text: string): this
    row(): this
    resized(): this
    oneTime(): this
  }
  export class InputFile {
    constructor(data: any, filename?: string)
  }
  export class Api<R = any> {
    [key: string]: any
  }
  export type RawApi = any
  export function session<S = any, C = any>(options: any): any
}

declare module '@grammyjs/conversations' {
  export type Conversation<C = any> = any
  export type ConversationFlavor = any
  export function conversations(): any
  export function createConversation(fn: any, name?: string): any
}

declare module 'express' {
  const express: any
  export default express
  export type Request = any
  export type Response = any
}

declare module 'dotenv' {
  export function config(...args: any[]): any
}

declare module 'zod' {
  export const z: any
  export default z
}

declare module 'axios' {
  const axios: any
  export default axios
}

declare module 'cloudinary' {
  export const v2: any
}

declare module 'sharp' {
  const sharp: any
  export default sharp
}

declare module 'pino' {
  const pino: any
  export default pino
}

declare module 'node:fs' {
  const fs: any
  export = fs
}

declare module 'node:path' {
  const path: any
  export = path
}

declare module 'fs' {
  const fs: any
  export = fs
}

declare module 'path' {
  const path: any
  export = path
}
