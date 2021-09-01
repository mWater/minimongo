import { compileDocumentSelector } from "./selector";
import { MinimongoCollection, MinimongoDb } from "./types";
import { default as IndexedDb } from "./IndexedDb";
import { default as WebSQLDb } from "./WebSQLDb";
import { default as LocalStorageDb } from "./LocalStorageDb";
import { default as MemoryDb } from "./MemoryDb";
export { compileDocumentSelector };
export declare function autoselectLocalDb(options: any, success: any, error: any): IndexedDb | WebSQLDb | LocalStorageDb | MemoryDb;
export declare function migrateLocalDb(fromDb: any, toDb: any, success: any, error: any): any;
/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export declare function cloneLocalDb(fromDb: MinimongoDb, toDb: MinimongoDb, success: () => void, error: (err: any) => void): void;
/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export declare function cloneLocalCollection(fromCol: MinimongoCollection, toCol: MinimongoCollection, success: () => void, error: (err: any) => void): void;
export declare function processFind(items: any, selector: any, options: any): any[];
/** Include/exclude fields in mongo-style */
export declare function filterFields(items: any[], fields?: any): any[];
export declare function createUid(): string;
export declare function regularizeUpsert(docs: any, bases: any, success: any, error: any): any[];
