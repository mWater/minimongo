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
const utils = __importStar(require("./utils"));
const selector_1 = require("./selector");
/** Replicates data into a both a master and a replica db. Assumes both are identical at start
 * and then only uses master for finds and does all changes to both
 * Warning: removing a collection removes it from the underlying master and replica!
 */
class ReplicatingDb {
    constructor(masterDb, replicaDb) {
        this.collections = {};
        this.masterDb = masterDb;
        this.replicaDb = replicaDb;
    }
    addCollection(name, success, error) {
        const collection = new Collection(name, this.masterDb[name], this.replicaDb[name]);
        this[name] = collection;
        this.collections[name] = collection;
        if (success != null) {
            return success();
        }
    }
    removeCollection(name, success, error) {
        delete this[name];
        delete this.collections[name];
        if (success != null) {
            return success();
        }
    }
    getCollectionNames() {
        return lodash_1.default.keys(this.collections);
    }
}
exports.default = ReplicatingDb;
// Replicated collection.
class Collection {
    constructor(name, masterCol, replicaCol) {
        this.name = name;
        this.masterCol = masterCol;
        this.replicaCol = replicaCol;
    }
    find(selector, options) {
        return this.masterCol.find(selector, options);
    }
    findOne(selector, options, success, error) {
        return this.masterCol.findOne(selector, options, success, error);
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        // Upsert does to both
        return this.masterCol.upsert(lodash_1.default.map(items, "doc"), lodash_1.default.map(items, "base"), () => {
            return this.replicaCol.upsert(lodash_1.default.map(items, "doc"), lodash_1.default.map(items, "base"), (results) => {
                return success(docs);
            }, error);
        }, error);
    }
    remove(id, success, error) {
        // Do to both
        this.masterCol.remove(id, () => {
            this.replicaCol.remove(id, success, error);
        }, error);
    }
    cache(docs, selector, options, success, error) {
        // Calculate what has to be done for cache using the master database which is faster (usually MemoryDb)
        // then do minimum to both databases
        // Index docs
        let sort;
        const docsMap = lodash_1.default.keyBy(docs, "_id");
        // Compile sort
        if (options.sort) {
            sort = (0, selector_1.compileSort)(options.sort);
        }
        // Perform query
        return this.masterCol.find(selector, options).fetch((results) => {
            let result;
            const resultsMap = lodash_1.default.keyBy(results, "_id");
            // Determine if each result needs to be cached
            const toCache = [];
            for (let doc of docs) {
                result = resultsMap[doc._id];
                // Exclude any excluded _ids from being cached/uncached
                if (options && options.exclude && options.exclude.includes(doc._id)) {
                    continue;
                }
                // If not present locally, cache it
                if (!result) {
                    toCache.push(doc);
                    continue;
                }
                // If both have revisions (_rev) and new one is same or lower, do not cache
                if (doc._rev && result._rev && doc._rev <= result._rev) {
                    continue;
                }
                // Only cache if different
                if (!lodash_1.default.isEqual(doc, result)) {
                    toCache.push(doc);
                }
            }
            const toUncache = [];
            for (result of results) {
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
                // Determine which ones to uncache
                if (!docsMap[result._id]) {
                    toUncache.push(result._id);
                }
            }
            // Cache ones needing caching
            const performCaches = (next) => {
                if (toCache.length > 0) {
                    return this.masterCol.cacheList(toCache, () => {
                        return this.replicaCol.cacheList(toCache, () => {
                            return next();
                        }, error);
                    }, error);
                }
                else {
                    return next();
                }
            };
            // Uncache list
            const performUncaches = (next) => {
                if (toUncache.length > 0) {
                    return this.masterCol.uncacheList(toUncache, () => {
                        return this.replicaCol.uncacheList(toUncache, () => {
                            return next();
                        }, error);
                    }, error);
                }
                else {
                    return next();
                }
            };
            return performCaches(() => {
                return performUncaches(() => {
                    if (success != null) {
                        success();
                    }
                });
            });
        }, error);
    }
    pendingUpserts(success, error) {
        return this.masterCol.pendingUpserts(success, error);
    }
    pendingRemoves(success, error) {
        return this.masterCol.pendingRemoves(success, error);
    }
    resolveUpserts(upserts, success, error) {
        return this.masterCol.resolveUpserts(upserts, () => {
            return this.replicaCol.resolveUpserts(upserts, success, error);
        }, error);
    }
    resolveRemove(id, success, error) {
        return this.masterCol.resolveRemove(id, () => {
            return this.replicaCol.resolveRemove(id, success, error);
        }, error);
    }
    // Add but do not overwrite or record as upsert
    seed(docs, success, error) {
        return this.masterCol.seed(docs, () => {
            return this.replicaCol.seed(docs, success, error);
        }, error);
    }
    // Add but do not overwrite upserts or removes
    cacheOne(doc, success, error) {
        return this.masterCol.cacheOne(doc, () => {
            return this.replicaCol.cacheOne(doc, success, error);
        }, error);
    }
    // Add but do not overwrite upserts or removes
    cacheList(docs, success, error) {
        return this.masterCol.cacheList(docs, () => {
            return this.replicaCol.cacheList(docs, success, error);
        }, error);
    }
    uncache(selector, success, error) {
        return this.masterCol.uncache(selector, () => {
            return this.replicaCol.uncache(selector, success, error);
        }, error);
    }
    uncacheList(ids, success, error) {
        return this.masterCol.uncacheList(ids, () => {
            return this.replicaCol.uncacheList(ids, success, error);
        }, error);
    }
}
