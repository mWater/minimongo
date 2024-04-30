import { Doc, MinimongoCollectionFindOneOptions, MinimongoLocalCollection, MinimongoLocalDb } from "./types";
/** Replicates data into a both a master and a replica db. Assumes both are identical at start
 * and then only uses master for finds and does all changes to both
 * Warning: removing a collection removes it from the underlying master and replica!
 */
export default class ReplicatingDb implements MinimongoLocalDb {
    collections: {
        [collectionName: string]: Collection<any>;
    };
    masterDb: MinimongoLocalDb;
    replicaDb: MinimongoLocalDb;
    constructor(masterDb: MinimongoLocalDb, replicaDb: MinimongoLocalDb);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
declare class Collection<T extends Doc> implements MinimongoLocalCollection<T> {
    name: string;
    masterCol: MinimongoLocalCollection<T>;
    replicaCol: MinimongoLocalCollection<T>;
    constructor(name: string, masterCol: MinimongoLocalCollection, replicaCol: MinimongoLocalCollection);
    find(selector: any, options: any): {
        fetch(success: (docs: T[]) => void, error: (err: any) => void): void;
        fetch(): Promise<T[]>;
    };
    findOne(selector: any, options?: MinimongoCollectionFindOneOptions): Promise<T | null>;
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(doc: T): Promise<T | null>;
    upsert(doc: T, base: T | null | undefined): Promise<T | null>;
    upsert(docs: T[]): Promise<(T | null)[]>;
    upsert(docs: T[], bases: (T | null | undefined)[]): Promise<(T | null)[]>;
    upsert(doc: T, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(doc: T, base: T | null | undefined, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(docs: T[], success: (docs: (T | null)[]) => void, error: (err: any) => void): void;
    upsert(docs: T[], bases: (T | null | undefined)[], success: (item: (T | null)[]) => void, error: (err: any) => void): void;
    remove(id: any): Promise<void>;
    remove(id: any, success: () => void, error: (err: any) => void): void;
    cache(docs: any, selector: any, options: any, success: any, error: any): void;
    pendingUpserts(success: any, error: any): void;
    pendingRemoves(success: any, error: any): void;
    resolveUpserts(upserts: any, success: any, error: any): void;
    resolveRemove(id: any, success: any, error: any): void;
    seed(docs: any, success: any, error: any): void;
    cacheOne(doc: any, success: any, error: any): void;
    cacheList(docs: any, success: any, error: any): void;
    uncache(selector: any, success: any, error: any): void;
    uncacheList(ids: any, success: any, error: any): void;
}
export {};
