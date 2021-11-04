/// <reference types="node" />
import { Doc, Item, MinimongoCollectionFindOptions, MinimongoDb, MinimongoLocalCollection } from "./types";
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
    addCollection(name: any, success: any, error: any): any;
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
        fetch: (success: any, error: any) => NodeJS.Timeout;
    };
    findOne(selector: any, options: any, success: any, error?: any): NodeJS.Timeout;
    _findFetch(selector: any, options: any, success: any, error: any): NodeJS.Timeout;
    _applySafety: (items: any) => any;
    upsert(docs: any, bases: any, success: any, error?: any): any;
    remove(id: string, success: any, error: any): any;
    cache(docs: any, selector: any, options: any, success: any, error: any): NodeJS.Timeout;
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
