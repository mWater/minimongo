"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const async_1 = __importDefault(require("async"));
const idb_wrapper_1 = __importDefault(require("idb-wrapper"));
const utils = __importStar(require("./utils"));
const utils_1 = require("./utils");
const selector_1 = require("./selector");
// Create a database backed by IndexedDb. options must contain namespace: <string to uniquely identify database>
class IndexedDb {
    constructor(options, success, error) {
        this.collections = {};
        // Create database
        try {
            this.store = new idb_wrapper_1.default({
                dbVersion: 1,
                storeName: "minimongo_" + options.namespace,
                keyPath: ["col", "doc._id"],
                autoIncrement: false,
                onStoreReady: () => {
                    if (success) {
                        return success(this);
                    }
                },
                onError: error,
                indexes: [
                    { name: "col", keyPath: "col", unique: false, multiEntry: false },
                    { name: "col-state", keyPath: ["col", "state"], unique: false, multiEntry: false }
                ]
            });
        }
        catch (ex) {
            if (error) {
                error(ex);
            }
            return;
        }
    }
    addCollection(name, success, error) {
        const collection = new IndexedDbCollection(name, this.store);
        this[name] = collection;
        this.collections[name] = collection;
        if (success) {
            return success();
        }
    }
    removeCollection(name, success, error) {
        delete this[name];
        delete this.collections[name];
        // Remove all documents
        return this.store.query((matches) => {
            const keys = lodash_1.default.map(matches, (m) => [m.col, m.doc._id]);
            if (keys.length > 0) {
                return this.store.removeBatch(keys, function () {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success != null) {
                    return success();
                }
            }
        }, { index: "col", keyRange: this.store.makeKeyRange({ only: name }), onError: error });
    }
    getCollectionNames() {
        return lodash_1.default.keys(this.collections);
    }
}
exports.default = IndexedDb;
// Stores data in indexeddb store
class IndexedDbCollection {
    constructor(name, store) {
        this.name = name;
        this.store = store;
    }
    find(selector, options) {
        return {
            fetch: (success, error) => {
                return this._findFetch(selector, options, success, error);
            }
        };
    }
    findOne(selector, options, success, error) {
        if (lodash_1.default.isFunction(options)) {
            ;
            [options, success, error] = [{}, options, success];
        }
        this.find(selector, options).fetch(function (results) {
            if (success != null) {
                return success(results.length > 0 ? results[0] : null);
            }
        }, error);
    }
    _findFetch(selector, options, success, error) {
        // Get all docs from collection
        return this.store.query(function (matches) {
            // Filter removed docs
            matches = lodash_1.default.filter(matches, (m) => m.state !== "removed");
            if (success != null) {
                return success((0, utils_1.processFind)(lodash_1.default.map(matches, "doc"), selector, options));
            }
        }, { index: "col", keyRange: this.store.makeKeyRange({ only: this.name }), onError: error });
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        // Get bases
        const keys = lodash_1.default.map(items, (item) => [this.name, item.doc._id]);
        return this.store.getBatch(keys, (records) => {
            const puts = lodash_1.default.map(items, (item, i) => {
                // Prefer explicit base
                let base;
                if (item.base !== undefined) {
                    ;
                    ({ base } = item);
                }
                else if (records[i] && records[i].doc && records[i].state === "cached") {
                    base = records[i].doc;
                }
                else if (records[i] && records[i].doc && records[i].state === "upserted") {
                    ;
                    ({ base } = records[i]);
                }
                else {
                    base = null;
                }
                return {
                    col: this.name,
                    state: "upserted",
                    doc: item.doc,
                    base
                };
            });
            return this.store.putBatch(puts, function () {
                if (success) {
                    return success(docs);
                }
            }, error);
        }, error);
    }
    remove(id, success, error) {
        // Special case for filter-type remove
        if (lodash_1.default.isObject(id)) {
            this.find(id).fetch((rows) => {
                return async_1.default.each(rows, ((row, cb) => {
                    this.remove(row._id, () => cb(), cb);
                }), () => success());
            }, error);
            return;
        }
        // Find record
        return this.store.get([this.name, id], (record) => {
            // If not found, create placeholder record
            if (record == null) {
                record = {
                    col: this.name,
                    doc: { _id: id }
                };
            }
            // Set removed
            record.state = "removed";
            // Update
            return this.store.put(record, function () {
                if (success) {
                    return success();
                }
            }, error);
        });
    }
    cache(docs, selector, options, success, error) {
        const step2 = () => {
            // Rows have been cached, now look for stale ones to remove
            let sort;
            const docsMap = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(docs, "_id"), docs));
            if (options.sort) {
                sort = (0, selector_1.compileSort)(options.sort);
            }
            // Perform query, removing rows missing in docs from local db
            return this.find(selector, options).fetch((results) => {
                const removes = [];
                const keys = lodash_1.default.map(results, (result) => [this.name, result._id]);
                if (keys.length === 0) {
                    if (success != null) {
                        success();
                    }
                    return;
                }
                return this.store.getBatch(keys, (records) => {
                    for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                        const record = records[i];
                        const result = results[i];
                        // If not present in docs and is present locally and not upserted/deleted
                        if (!docsMap[result._id] && record && record.state === "cached") {
                            // If at limit
                            if (options.limit && docs.length === options.limit) {
                                // If past end on sorted limited, ignore
                                if (options.sort && sort(result, lodash_1.default.last(docs)) >= 0) {
                                    continue;
                                }
                                // If no sort, ignore
                                if (!options.sort) {
                                    continue;
                                }
                            }
                            // Exclude any excluded _ids from being cached/uncached
                            if (options && options.exclude && options.exclude.includes(result._id)) {
                                continue;
                            }
                            // Item is gone from server, remove locally
                            removes.push([this.name, result._id]);
                        }
                    }
                    // If removes, handle them
                    if (removes.length > 0) {
                        return this.store.removeBatch(removes, function () {
                            if (success != null) {
                                return success();
                            }
                        }, error);
                    }
                    else {
                        if (success != null) {
                            return success();
                        }
                    }
                }, error);
            }, error);
        };
        if (docs.length === 0) {
            return step2();
        }
        // Create keys to get items
        const keys = lodash_1.default.map(docs, (doc) => [this.name, doc._id]);
        // Create batch of puts
        const puts = [];
        return this.store.getBatch(keys, (records) => {
            // Add all non-local that are not upserted or removed
            for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                const record = records[i];
                const doc = docs[i];
                // Check if not present or not upserted/deleted
                if (record == null || record.state === "cached") {
                    if (options && options.exclude && options.exclude.includes(doc._id)) {
                        continue;
                    }
                    // If _rev present, make sure that not overwritten by lower or equal _rev
                    if (!record || !doc._rev || !record.doc._rev || doc._rev > record.doc._rev) {
                        puts.push({ col: this.name, state: "cached", doc });
                    }
                }
            }
            // Put batch
            if (puts.length > 0) {
                return this.store.putBatch(puts, step2, error);
            }
            else {
                return step2();
            }
        }, error);
    }
    pendingUpserts(success, error) {
        return this.store.query(function (matches) {
            const upserts = lodash_1.default.map(matches, (m) => ({
                doc: m.doc,
                base: m.base || null
            }));
            if (success != null) {
                return success(upserts);
            }
        }, { index: "col-state", keyRange: this.store.makeKeyRange({ only: [this.name, "upserted"] }), onError: error });
    }
    pendingRemoves(success, error) {
        return this.store.query(function (matches) {
            if (success != null) {
                return success(lodash_1.default.map(lodash_1.default.map(matches, "doc"), "_id"));
            }
        }, { index: "col-state", keyRange: this.store.makeKeyRange({ only: [this.name, "removed"] }), onError: error });
    }
    resolveUpserts(upserts, success, error) {
        // Get items
        const keys = lodash_1.default.map(upserts, (upsert) => [this.name, upsert.doc._id]);
        return this.store.getBatch(keys, (records) => {
            const puts = [];
            for (let i = 0, end = upserts.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                const record = records[i];
                // Only safely remove upsert if doc is the same
                if (record && record.state === "upserted") {
                    if (lodash_1.default.isEqual(record.doc, upserts[i].doc)) {
                        record.state = "cached";
                        puts.push(record);
                    }
                    else {
                        record.base = upserts[i].doc;
                        puts.push(record);
                    }
                }
            }
            // Put all changed items
            if (puts.length > 0) {
                return this.store.putBatch(puts, function () {
                    if (success) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success) {
                    return success();
                }
            }
        }, error);
    }
    resolveRemove(id, success, error) {
        return this.store.get([this.name, id], (record) => {
            // Check if exists
            if (!record) {
                if (success != null) {
                    success();
                }
                return;
            }
            // Only remove if removed
            if (record.state === "removed") {
                return this.store.remove([this.name, id], function () {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
        });
    }
    // Add but do not overwrite or record as upsert
    seed(docs, success, error) {
        if (!lodash_1.default.isArray(docs)) {
            docs = [docs];
        }
        // Create keys to get items
        const keys = lodash_1.default.map(docs, (doc) => [this.name, doc._id]);
        // Create batch of puts
        const puts = [];
        return this.store.getBatch(keys, (records) => {
            // Add all non-local that are not upserted or removed
            for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                const record = records[i];
                const doc = docs[i];
                // Check if not present
                if (record == null) {
                    puts.push({ col: this.name, state: "cached", doc });
                }
            }
            // Put batch
            if (puts.length > 0) {
                return this.store.putBatch(puts, () => {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success != null) {
                    return success();
                }
            }
        }, error);
    }
    // Add but do not overwrite upsert/removed and do not record as upsert
    cacheOne(doc, success, error) {
        return this.cacheList([doc], success, error);
    }
    cacheList(docs, success, error) {
        // Create keys to get items
        const keys = lodash_1.default.map(docs, (doc) => [this.name, doc._id]);
        // Create batch of puts
        const puts = [];
        return this.store.getBatch(keys, (records) => {
            for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                let record = records[i];
                const doc = docs[i];
                // If _rev present, make sure that not overwritten by lower equal _rev
                if (record && doc._rev && record.doc._rev && doc._rev <= record.doc._rev) {
                    continue;
                }
                if (record == null) {
                    record = {
                        col: this.name,
                        state: "cached",
                        doc
                    };
                }
                if (record.state === "cached") {
                    record.doc = doc;
                    puts.push(record);
                }
            }
            // Put batch
            if (puts.length > 0) {
                return this.store.putBatch(puts, () => {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success != null) {
                    return success();
                }
            }
        }, error);
    }
    uncache(selector, success, error) {
        const compiledSelector = utils.compileDocumentSelector(selector);
        // Get all docs from collection
        return this.store.query((matches) => {
            // Filter ones to remove
            matches = lodash_1.default.filter(matches, (m) => m.state === "cached" && compiledSelector(m.doc));
            const keys = lodash_1.default.map(matches, (m) => [this.name, m.doc._id]);
            if (keys.length > 0) {
                return this.store.removeBatch(keys, () => {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success != null) {
                    return success();
                }
            }
        }, { index: "col", keyRange: this.store.makeKeyRange({ only: this.name }), onError: error });
    }
    uncacheList(ids, success, error) {
        const idIndex = lodash_1.default.keyBy(ids);
        // Android 2.x requires error callback
        error = error || function () { };
        // Get all docs from collection
        return this.store.query((matches) => {
            // Filter ones to remove
            matches = lodash_1.default.filter(matches, (m) => m.state === "cached" && idIndex[m.doc._id]);
            const keys = lodash_1.default.map(matches, (m) => [this.name, m.doc._id]);
            if (keys.length > 0) {
                return this.store.removeBatch(keys, () => {
                    if (success != null) {
                        return success();
                    }
                }, error);
            }
            else {
                if (success != null) {
                    return success();
                }
            }
        }, { index: "col", keyRange: this.store.makeKeyRange({ only: this.name }), onError: error });
    }
}
