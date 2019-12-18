import { MinimongoCollection } from "..";

/** Compile a document selector (query) to a lambda function */
export function compileDocumentSelector(selector: any): (doc: any) => boolean 

/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export function cloneLocalCollection(fromCol: MinimongoCollection, toCol: MinimongoCollection, success: () => void, error: (err: any) => void): void