import { Doc, Item, MinimongoCollectionFindOneOptions, MinimongoCollectionFindOptions, MinimongoDb, MinimongoLocalCollection } from "./types";
export default class MemoryDb implements MinimongoDb {
    collections: {
        [collectionName: string]: Collection<any>;
    };
    options: {
        safety: "clone" | "freeze";
    };
    constructor(options?: {
        safety?: "clone" | "freeze";
    }, success?: any);
    addCollection(name: string, success?: () => void, error?: (err: any) => void): void;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
declare class Collection<T extends Doc> implements MinimongoLocalCollection<T> {
    name: string;
    items: {
        [id: string]: T;
    };
    upserts: {
        [id: string]: Item<T>;
    };
    removes: {
        [id: string]: T;
    };
    options: {
        safety?: "clone" | "freeze";
    };
    constructor(name: any, options: {
        safety?: "clone" | "freeze";
    });
    find(selector: any, options?: MinimongoCollectionFindOptions): {
        fetch: (success?: any, error?: any) => any;
    };
    findOne(selector: any, options?: MinimongoCollectionFindOneOptions): Promise<T | null>;
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void;
    _findFetch(selector: any, options: any, success: any, error: any): any;
    _applySafety: (items: any) => any;
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
    pendingUpserts(success: any): any;
    pendingRemoves(success: any): any;
    resolveUpserts(upserts: any, success: any): any;
    resolveRemove(id: any, success: any): any;
    seed(docs: any, success: any): any;
    cacheOne(doc: any, success: any, error: any): any;
    cacheList(docs: any, success: any, error?: any): any;
    uncache(selector: any, success: any, error: any): any;
    uncacheList(ids: any, success: any, error: any): any;
}
export {};
