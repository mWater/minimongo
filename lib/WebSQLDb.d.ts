import { MinimongoCollection, MinimongoDb } from "./types";
export default class WebSQLDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    db: any;
    constructor(options: any, success: any, error: any);
    addCollection(name: any, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
