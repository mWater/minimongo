import { MinimongoDb, MinimongoCollection } from "./types";
export default class RemoteDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    constructor(url: string, client: any, httpClient: any, useQuickFind?: boolean, usePostFind?: boolean);
    addCollection(name: any, options: {} | undefined, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
