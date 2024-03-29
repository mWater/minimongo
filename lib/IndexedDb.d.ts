import { MinimongoCollectionFindOneOptions, MinimongoCollectionFindOptions, MinimongoLocalDb } from "./types";
import { MinimongoLocalCollection } from ".";
export default class IndexedDb implements MinimongoLocalDb {
    collections: {
        [collectionName: string]: IndexedDbCollection<any>;
    };
    store: any;
    constructor(options: any, success: any, error: any);
    addCollection(name: string, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
declare class IndexedDbCollection<T> implements MinimongoLocalCollection<T> {
    name: string;
    store: any;
    constructor(name: string, store: any);
    find(selector: any, options?: MinimongoCollectionFindOptions): {
        fetch: (success?: any, error?: any) => any;
    };
    findOne(selector: any, options?: MinimongoCollectionFindOneOptions): Promise<T | null>;
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void;
    _findFetch(selector: any, options: any, success: any, error: any): any;
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
    cache(docs: any, selector: any, options: any, success: any, error: any): any;
    pendingUpserts(success: any, error: any): any;
    pendingRemoves(success: any, error: any): any;
    resolveUpserts(upserts: any, success: any, error: any): any;
    resolveRemove(id: any, success: any, error: any): any;
    seed(docs: any, success: any, error: any): any;
    cacheOne(doc: any, success: any, error: any): any;
    cacheList(docs: any, success: any, error: any): any;
    uncache(selector: any, success: any, error: any): any;
    uncacheList(ids: any, success: any, error: any): any;
}
export {};
