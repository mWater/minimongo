import * as utils from './src/utils'

export interface MinimongoCollectionFindOptions {
  fields?: any
  sort?: any
  limit?: number
  skip?: number
  cacheFind?: boolean
  interim?: boolean
  timeout?: number

  /** Only for RemoteDb.find */ 
  localData?: any[]

  /** Only for RemoteDb.find, Must be an mwater-expression */ 
  whereExpr?: any
  /** Only for RemoteDb.find. expr must be an mwater-expression */ 
  orderByExprs?: { expr: any, dir: "asc" | "desc" }[]
}

export class MinimongoDb {
  addCollection<T>(name: string, options?: any, success?: (collection: MinimongoCollection<T>) => void, error?: (err: any) => void): void
  removeCollection<T>(name: string, success?: () => void, error?: (err: any) => void): void
  getCollectionNames(): string[]
  localDb?: MinimongoDb
  remoteDb?: MinimongoDb 
  collections: { [collectionName: string]: MinimongoCollection }
}

export interface MinimongoCollection<ItemType = any> {
  find(selector: any, options?: MinimongoCollectionFindOptions): { 
    fetch(success: (items: ItemType[]) => void, error: (err: any) => void): void
  }

  find(selector: any): { 
    fetch(success: (items: ItemType[]) => void, error: (err: any) => void): void
  }

  findOne(selector: any, options: { fields?: any, sort?: any, limit?: number, skip?: number, interim?: boolean, cacheFindOne?: boolean, timeout?: number }, success: (item: ItemType | null) => void, error: (err: any) => void): void

  findOne(selector: any, success: (item: ItemType | null) => void, error: (err: any) => void): void

  upsert(item: ItemType, success: (item: ItemType | null) => void, error: (err: any) => void): void
  upsert(item: ItemType, baseRow: ItemType, success: (item: ItemType | null) => void, error: (err: any) => void): void
  upsert(items: ItemType[], success: (item: ItemType | null) => void, error: (err: any) => void): void
  upsert(items: ItemType[], baseRows: ItemType[], success: (item: ItemType | null) => void, error: (err: any) => void): void

  remove(itemId: string, success: () => void, error: (err: any) => void): void

  cache?(docs: ItemType[], selector: any, options: any, success: () => void, error: (err: any) => void): void
  pendingUpserts?(success: (items: ItemType[]) => void, error: (err: any) => void): void
  pendingRemoves?(success: (ids: string[]) => void, error: (err: any) => void): void
  resolveRemove?(id: string, success: () => void, error: (err: any) => void): void
  /** Add but do not overwrite or record as upsert */
  seed?(docs: ItemType[], success: () => void, error: (err: any) => void): void

  /** Add but do not overwrite upserts or removes */
  cacheOne?(doc: ItemType, success: () => void, error: (err: any) => void): void

  /** Add but do not overwrite upserts or removes */
  cacheList?(docs: ItemType[], success: () => void, error: (err: any) => void): void

  uncache?(selector: any, success: () => void, error: (err: any) => void): void
  uncacheList?(ids: string[], success: () => void, error: (err: any) => void): void
}


export class MemoryDb extends MinimongoDb {}
export class LocalStorageDb extends MinimongoDb {}
export class IndexedDb extends MinimongoDb {}
export class WebSQLDb extends MinimongoDb {}
export class RemoteDb extends MinimongoDb {}
export class HybridDb extends MinimongoDb {}
export class ReplicatingDb extends MinimongoDb {}

// exports.quickfind = require('./lib/quickfind');
export { utils }
