import { MinimongoCollection, MinimongoDb } from "./types";
export default class MemoryDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    options: any;
    constructor(options?: any, success?: any);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
