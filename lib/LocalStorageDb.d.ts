import { MinimongoCollection, MinimongoDb } from "./types";
export default class LocalStorageDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    namespace: string;
    constructor(options: any, success: any, error?: any);
    addCollection(name: string, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
