import { MinimongoDb, Doc, MinimongoCollectionFindOptions, MinimongoCollectionFindOneOptions } from "./types";
import { MinimongoBaseCollection } from ".";
export default class RemoteDb implements MinimongoDb {
    collections: {
        [collectionName: string]: Collection<any>;
    };
    url: string | string[];
    client: string | null | undefined;
    httpClient: any;
    useQuickFind: boolean;
    usePostFind: boolean;
    /** Url must have trailing /, can be an arrau of URLs
     * useQuickFind enables the quickfind protocol for finds
     * usePostFind enables POST for find
     */
    constructor(url: string | string[], client?: string | null, httpClient?: any, useQuickFind?: boolean, usePostFind?: boolean);
    addCollection(name: string, options: {
        url?: string | undefined;
        useQuickFind?: boolean | undefined;
        usePostFind?: boolean | undefined;
    } | undefined, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
declare class Collection<T extends Doc> implements MinimongoBaseCollection<T> {
    name: any;
    url: any;
    client: any;
    httpClient: any;
    useQuickFind: any;
    usePostFind: any;
    constructor(name: any, url: any, client: any, httpClient: any, useQuickFind: any, usePostFind: any);
    getUrl(): any;
    find(selector: any, options?: MinimongoCollectionFindOptions): {
        fetch: (success: any, error: any) => any;
    };
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(docs: any, bases: any, success: any, error?: any): any;
    remove(id: any, success: any, error: any): any;
}
export {};
