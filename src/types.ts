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

export interface MinimongoCollectionFindOneOptions {
  fields?: any
  sort?: any
  limit?: number
  skip?: number
  interim?: boolean
  cacheFindOne?: boolean
  timeout?: number
  shortcut?: boolean
}

export interface MinimongoDb {
  localDb?: MinimongoLocalDb
  remoteDb?: MinimongoDb 
  collections: { [collectionName: string]: MinimongoCollection }

  addCollection<T>(name: string, options?: any, success?: (collection: MinimongoCollection<T>) => void, error?: (err: any) => void): void
  removeCollection<T>(name: string, success?: () => void, error?: (err: any) => void): void
  getCollectionNames(): string[]
}

/** Local minimongo db which has local collections */
export interface MinimongoLocalDb extends MinimongoDb {
  collections: { [collectionName: string]: MinimongoLocalCollection }

  addCollection<T>(name: string, options?: any, success?: (collection: MinimongoLocalCollection<T>) => void, error?: (err: any) => void): void
}

export interface MinimongoBaseCollection<T = any> {
  find(selector: any, options?: MinimongoCollectionFindOptions): { 
    fetch(success: (docs: T[]) => void, error: (err: any) => void): void
  }

  findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void
  findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void

  upsert(doc: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(doc: T, base: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(docs: T[], success: (docs: (T | null)[]) => void, error: (err: any) => void): void
  upsert(docs: T[], bases: T[], success: (item: T | null) => void, error: (err: any) => void): void

  remove(id: string, success: () => void, error: (err: any) => void): void
}

export interface MinimongoLocalCollection<T = any> extends MinimongoBaseCollection<T> {
  cache(docs: T[], selector: any, options: any, success: () => void, error: (err: any) => void): void
  pendingUpserts(success: (items: Item<T>[]) => void, error: (err: any) => void): void
  pendingRemoves(success: (ids: string[]) => void, error: (err: any) => void): void
  resolveUpserts(items: Item<T>[], success: () => void, error: (err: any) => void): void
  resolveRemove(id: string, success: () => void, error: (err: any) => void): void

  /** Add but do not overwrite or record as upsert */
  seed(docs: T[], success: () => void, error: (err: any) => void): void

  /** Add but do not overwrite upserts or removes */
  cacheOne(doc: T, success: () => void, error: (err: any) => void): void

  /** Add but do not overwrite upserts or removes */
  cacheList(docs: T[], success: () => void, error: (err: any) => void): void

  uncache(selector: any, success: () => void, error: (err: any) => void): void
  uncacheList(ids: string[], success: () => void, error: (err: any) => void): void
}

/** Document base */
export interface Doc {
  _id?: string
  _rev?: number
}

/** Item with doc and optional base */
export interface Item<T> {
  doc: T
  base?: T
}

export type MinimongoCollection<T = any> = MinimongoBaseCollection<T> | MinimongoLocalCollection<T>
