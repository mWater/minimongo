import { MinimongoCollection, MinimongoDb } from "./types";
export default class ReplicatingDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    masterDb: MinimongoDb;
    replicaDb: MinimongoDb;
    constructor(masterDb: MinimongoDb, replicaDb: MinimongoDb);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
