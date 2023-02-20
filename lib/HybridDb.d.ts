import { Doc, MinimongoBaseCollection, MinimongoCollection, MinimongoCollectionFindOneOptions, MinimongoDb, MinimongoLocalCollection } from "./types";
import { MinimongoLocalDb } from ".";
/** Bridges a local and remote database, querying from the local first and then
 * getting the remote. Also uploads changes from local to remote.
 */
export default class HybridDb implements MinimongoDb {
    localDb: MinimongoLocalDb;
    remoteDb: MinimongoDb;
    collections: {
        [collectionName: string]: HybridCollection<any>;
    };
    constructor(localDb: MinimongoLocalDb, remoteDb: MinimongoDb);
    addCollection(name: string, success?: () => void, error?: (error: any) => void): void;
    addCollection(name: string, options?: HybridCollectionOptions, success?: any, error?: any): void;
    removeCollection(name: any, success: any, error: any): any;
    /** Upload any changes to the remote database */
    upload(success: () => void, error: (err: any) => void): void;
    upload(): Promise<void>;
    getCollectionNames(): string[];
}
export interface HybridCollectionOptions {
    /** Cache find results in local db */
    cacheFind?: boolean;
    /** Cache findOne results in local db */
    cacheFindOne?: boolean;
    /** Return interim results from local db while waiting for remote db. Return again if different */
    interim?: boolean;
    /** Set to ms to timeout in for remote calls */
    timeout?: number;
    /** Use local results if the remote find fails. Only applies if interim is false. */
    useLocalOnRemoteError?: boolean;
    /** true to return `findOne` results if any matching result is found in the local database. Useful for documents that change rarely. */
    shortcut?: boolean;
    /** Compare function to sort upserts sent to server */
    sortUpserts: (a: Doc, b: Doc) => number;
}
export declare class HybridCollection<T extends Doc> implements MinimongoBaseCollection<T> {
    name: string;
    localCol: MinimongoLocalCollection<any>;
    remoteCol: MinimongoCollection<any>;
    options: any;
    constructor(name: string, localCol: MinimongoLocalCollection<T>, remoteCol: MinimongoCollection<T>, options?: HybridCollectionOptions);
    find(selector: any, options?: {}): {
        fetch: (success?: any, error?: any) => any;
    };
    findOne(selector: any, options?: MinimongoCollectionFindOneOptions): Promise<T | null>;
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (item: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (item: T | null) => void, error: (err: any) => void): void;
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
    upload(success: () => void, error: (err: any) => void): void;
}
