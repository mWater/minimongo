import { MinimongoCollection, MinimongoDb } from "./types";
export default class IndexedDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    constructor(options: any, success: any, error: any);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
