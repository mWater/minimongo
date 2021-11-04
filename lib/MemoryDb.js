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
const utils = __importStar(require("./utils"));
const utils_1 = require("./utils");
const selector_1 = require("./selector");
class MemoryDb {
    // Options are:
    //  safety: How to protect the in-memory copies: "clone" (default) returns a fresh copy but is slow. "freeze" returns a frozen version
    constructor(options, success) {
        this.collections = {};
        this.options = lodash_1.default.defaults(options, { safety: "clone" });
        if (success) {
            success(this);
        }
    }
    addCollection(name, success, error) {
        const collection = new Collection(name, this.options);
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
exports.default = MemoryDb;
// Stores data in memory
class Collection {
    constructor(name, options) {
        // Applies safety (either freezing or cloning to object or array)
        this._applySafety = (items) => {
            if (!items) {
                return items;
            }
            if (lodash_1.default.isArray(items)) {
                return lodash_1.default.map(items, this._applySafety);
            }
            if (this.options.safety === "clone" || !this.options.safety) {
                return JSON.parse(JSON.stringify(items));
            }
            if (this.options.safety === "freeze") {
                Object.freeze(items);
                return items;
            }
            throw new Error(`Unsupported safety ${this.options.safety}`);
        };
        this.name = name;
        this.items = {};
        this.upserts = {}; // Pending upserts by _id. Still in items
        this.removes = {}; // Pending removes by _id. No longer in items
        this.options = options || {};
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
        return this.find(selector, options).fetch((results) => {
            if (success != null) {
                return success(this._applySafety(results.length > 0 ? results[0] : null));
            }
        }, error);
    }
    _findFetch(selector, options, success, error) {
        // Defer to allow other processes to run
        return setTimeout(() => {
            // Shortcut if _id is specified
            let allItems;
            if (selector && selector._id && lodash_1.default.isString(selector._id)) {
                allItems = lodash_1.default.compact([this.items[selector._id]]);
            }
            else {
                allItems = lodash_1.default.values(this.items);
            }
            const results = (0, utils_1.processFind)(allItems, selector, options);
            if (success != null) {
                return success(this._applySafety(results));
            }
        }, 0);
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        // Keep independent copies to prevent modification
        items = JSON.parse(JSON.stringify(items));
        for (let item of items) {
            // Fill in base if undefined
            if (item.base === undefined) {
                // Use existing base
                if (this.upserts[item.doc._id]) {
                    item.base = this.upserts[item.doc._id].base;
                }
                else {
                    item.base = this.items[item.doc._id] || null;
                }
            }
            // Replace/add
            this.items[item.doc._id] = item.doc;
            this.upserts[item.doc._id] = item;
        }
        if (lodash_1.default.isArray(docs)) {
            if (success) {
                return success(this._applySafety(lodash_1.default.map(items, "doc")));
            }
        }
        else {
            if (success) {
                return success(this._applySafety(lodash_1.default.map(items, "doc")[0]));
            }
        }
    }
    remove(id, success, error) {
        // Special case for filter-type remove
        if (lodash_1.default.isObject(id)) {
            this.find(id).fetch((rows) => {
                return async_1.default.each(rows, ((row, cb) => {
                    return this.remove(row._id, () => cb(), cb);
                }), () => success());
            }, error);
            return;
        }
        if (lodash_1.default.has(this.items, id)) {
            this.removes[id] = this.items[id];
            delete this.items[id];
            delete this.upserts[id];
        }
        else {
            this.removes[id] = { _id: id };
        }
        if (success != null) {
            return success();
        }
    }
    // Options are find options with optional "exclude" which is list of _ids to exclude
    cache(docs, selector, options, success, error) {
        // Add all non-local that are not upserted or removed
        let sort;
        for (let doc of docs) {
            // Exclude any excluded _ids from being cached/uncached
            if (options && options.exclude && options.exclude.includes(doc._id)) {
                continue;
            }
            this.cacheOne(doc, () => { }, () => { });
        }
        const docsMap = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(docs, "_id"), docs));
        if (options.sort) {
            sort = (0, selector_1.compileSort)(options.sort);
        }
        // Perform query, removing rows missing in docs from local db
        return this.find(selector, options).fetch((results) => {
            for (let result of results) {
                if (!docsMap[result._id] && !lodash_1.default.has(this.upserts, result._id)) {
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
                    delete this.items[result._id];
                }
            }
            if (success != null) {
                return success();
            }
        }, error);
    }
    pendingUpserts(success) {
        return success(lodash_1.default.values(this.upserts));
    }
    pendingRemoves(success) {
        return success(lodash_1.default.map(this.removes, "_id"));
    }
    resolveUpserts(upserts, success) {
        for (let upsert of upserts) {
            const id = upsert.doc._id;
            if (this.upserts[id]) {
                // Only safely remove upsert if doc is unchanged
                if (lodash_1.default.isEqual(upsert.doc, this.upserts[id].doc)) {
                    delete this.upserts[id];
                }
                else {
                    // Just update base
                    this.upserts[id].base = upsert.doc;
                }
            }
        }
        if (success != null) {
            return success();
        }
    }
    resolveRemove(id, success) {
        delete this.removes[id];
        if (success != null) {
            return success();
        }
    }
    // Add but do not overwrite or record as upsert
    seed(docs, success) {
        if (!lodash_1.default.isArray(docs)) {
            docs = [docs];
        }
        for (let doc of docs) {
            if (!lodash_1.default.has(this.items, doc._id) && !lodash_1.default.has(this.removes, doc._id)) {
                this.items[doc._id] = doc;
            }
        }
        if (success != null) {
            return success();
        }
    }
    // Add but do not overwrite upserts or removes
    cacheOne(doc, success, error) {
        return this.cacheList([doc], success, error);
    }
    // Add but do not overwrite upserts or removes
    cacheList(docs, success, error) {
        for (let doc of docs) {
            if (!lodash_1.default.has(this.upserts, doc._id) && !lodash_1.default.has(this.removes, doc._id)) {
                const existing = this.items[doc._id];
                // If _rev present, make sure that not overwritten by lower or equal _rev
                if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
                    this.items[doc._id] = doc;
                }
            }
        }
        if (success != null) {
            return success();
        }
    }
    uncache(selector, success, error) {
        const compiledSelector = utils.compileDocumentSelector(selector);
        const items = lodash_1.default.filter(lodash_1.default.values(this.items), (item) => {
            return this.upserts[item._id] != null || !compiledSelector(item);
        });
        this.items = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(items, "_id"), items));
        if (success != null) {
            return success();
        }
    }
    uncacheList(ids, success, error) {
        const idIndex = lodash_1.default.keyBy(ids);
        const items = lodash_1.default.filter(lodash_1.default.values(this.items), (item) => {
            return this.upserts[item._id] != null || !idIndex[item._id];
        });
        this.items = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(items, "_id"), items));
        if (success != null) {
            return success();
        }
    }
}
