import { MinimongoCollection, MinimongoDb } from "./types";
export default class HybridDb implements MinimongoDb {
    localDb: MinimongoDb;
    remoteDb: MinimongoDb;
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    constructor(localDb: MinimongoDb, remoteDb: MinimongoDb);
    addCollection(name: any, options: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    upload(success: any, error: any): any;
    getCollectionNames(): string[];
}
