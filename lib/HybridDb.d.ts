import { Doc, MinimongoBaseCollection, MinimongoCollection, MinimongoCollectionFindOneOptions, MinimongoDb, MinimongoLocalCollection } from "./types";
/** Bridges a local and remote database, querying from the local first and then
 * getting the remote. Also uploads changes from local to remote.
 */
export default class HybridDb implements MinimongoDb {
    localDb: MinimongoDb;
    remoteDb: MinimongoDb;
    collections: {
        [collectionName: string]: HybridCollection<any>;
    };
    constructor(localDb: MinimongoDb, remoteDb: MinimongoDb);
    addCollection(name: any, options?: any, success?: any, error?: any): any;
    removeCollection(name: any, success: any, error: any): any;
    upload(success: any, error: any): void;
    getCollectionNames(): string[];
}
export declare class HybridCollection<T extends Doc> implements MinimongoBaseCollection<T> {
    name: string;
    localCol: MinimongoLocalCollection<any>;
    remoteCol: MinimongoCollection<any>;
    options: any;
    constructor(name: string, localCol: MinimongoLocalCollection<T>, remoteCol: MinimongoCollection<T>, options: any);
    find(selector: any, options?: {}): {
        fetch: (success: any, error: any) => void;
    };
    findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (item: T | null) => void, error: (err: any) => void): void;
    findOne(selector: any, success: (item: T | null) => void, error: (err: any) => void): void;
    _findFetch(selector: any, options: any, success: any, error: any): void;
    upsert(doc: T, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(doc: T, base: T, success: (doc: T | null) => void, error: (err: any) => void): void;
    upsert(docs: T[], success: (docs: (T | null)[]) => void, error: (err: any) => void): void;
    upsert(docs: T[], bases: T[], success: (item: T | null) => void, error: (err: any) => void): void;
    remove(id: any, success: () => void, error: (err: any) => void): void;
    upload(success: () => void, error: (err: any) => void): void;
}
