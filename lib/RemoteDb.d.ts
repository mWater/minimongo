import { MinimongoDb, MinimongoCollection } from "./types";
export default class RemoteDb implements MinimongoDb {
    collections: {
        [collectionName: string]: MinimongoCollection<any>;
    };
    url: string | string[];
    client: string | null | undefined;
    httpClient: any;
    useQuickFind: boolean;
    usePostFind: boolean;
    constructor(url: string | string[], client?: string | null, httpClient?: any, useQuickFind?: boolean, usePostFind?: boolean);
    addCollection(name: any, options: {
        url?: string | undefined;
        useQuickFind?: boolean | undefined;
        usePostFind?: boolean | undefined;
    } | undefined, success: any, error: any): any;
    removeCollection(name: any, success: any, error: any): any;
    getCollectionNames(): string[];
}
