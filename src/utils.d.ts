
/** Compile a document selector (query) to a lambda function */
export function compileDocumentSelector(selector: any): (doc: any) => boolean 