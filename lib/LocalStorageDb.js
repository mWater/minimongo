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
class LocalStorageDb {
    constructor(options, success, error) {
        this.collections = {};
        if (options && options.namespace && window.localStorage) {
            this.namespace = options.namespace;
        }
        if (success) {
            success(this);
        }
    }
    addCollection(name, success, error) {
        // Set namespace for collection
        let namespace;
        if (this.namespace) {
            namespace = this.namespace + "." + name;
        }
        const collection = new Collection(name, namespace);
        this[name] = collection;
        this.collections[name] = collection;
        if (success != null) {
            return success();
        }
    }
    removeCollection(name, success, error) {
        if (this.namespace && window.localStorage) {
            const keys = [];
            for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                keys.push(window.localStorage.key(i));
            }
            for (let key of keys) {
                const keyToMatch = this.namespace + "." + name;
                if (key.substring(0, keyToMatch.length) === keyToMatch) {
                    window.localStorage.removeItem(key);
                }
            }
        }
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
exports.default = LocalStorageDb;
// Stores data in memory, optionally backed by local storage
class Collection {
    constructor(name, namespace) {
        this.name = name;
        this.namespace = namespace;
        this.items = {};
        this.upserts = {}; // Pending upserts by _id. Still in items
        this.removes = {}; // Pending removes by _id. No longer in items
        // Read from local storage
        if (window.localStorage && namespace != null) {
            this.loadStorage();
        }
    }
    loadStorage() {
        // Read items from localStorage
        let key;
        this.itemNamespace = this.namespace + "_";
        for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            key = window.localStorage.key(i);
            if (key.substring(0, this.itemNamespace.length) === this.itemNamespace) {
                const item = JSON.parse(window.localStorage[key]);
                this.items[item._id] = item;
            }
        }
        // Read upserts
        const upsertKeys = window.localStorage[this.namespace + "upserts"]
            ? JSON.parse(window.localStorage[this.namespace + "upserts"])
            : [];
        for (key of upsertKeys) {
            this.upserts[key] = { doc: this.items[key] };
            // Get base if present
            const base = window.localStorage[this.namespace + "upsertbase_" + key]
                ? JSON.parse(window.localStorage[this.namespace + "upsertbase_" + key])
                : null;
            this.upserts[key].base = base;
        }
        // Read removes
        const removeItems = window.localStorage[this.namespace + "removes"]
            ? JSON.parse(window.localStorage[this.namespace + "removes"])
            : [];
        return (this.removes = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(removeItems, "_id"), removeItems)));
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
        return this.find(selector, options).fetch(function (results) {
            if (success != null) {
                return success(results.length > 0 ? results[0] : null);
            }
        }, error);
    }
    _findFetch(selector, options, success, error) {
        // Deep clone to prevent modification
        if (success != null) {
            return success((0, utils_1.processFind)(lodash_1.default.cloneDeep(lodash_1.default.values(this.items)), selector, options));
        }
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        // Keep independent copies to prevent modification
        items = JSON.parse(JSON.stringify(items));
        for (let item of items) {
            // Fill in base
            if (item.base === undefined) {
                // Use existing base
                if (this.upserts[item.doc._id]) {
                    item.base = this.upserts[item.doc._id].base;
                }
                else {
                    item.base = this.items[item.doc._id] || null;
                }
            }
            // Keep independent copies
            item = lodash_1.default.cloneDeep(item);
            // Replace/add
            this._putItem(item.doc);
            this._putUpsert(item);
        }
        if (success) {
            return success(docs);
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
            this._putRemove(this.items[id]);
            this._deleteItem(id);
            this._deleteUpsert(id);
        }
        else {
            this._putRemove({ _id: id });
        }
        if (success != null) {
            return success();
        }
    }
    _putItem(doc) {
        this.items[doc._id] = doc;
        if (this.namespace) {
            window.localStorage[this.itemNamespace + doc._id] = JSON.stringify(doc);
        }
    }
    _deleteItem(id) {
        delete this.items[id];
        if (this.namespace) {
            window.localStorage.removeItem(this.itemNamespace + id);
        }
    }
    _putUpsert(upsert) {
        this.upserts[upsert.doc._id] = upsert;
        if (this.namespace) {
            window.localStorage[this.namespace + "upserts"] = JSON.stringify(lodash_1.default.keys(this.upserts));
            window.localStorage[this.namespace + "upsertbase_" + upsert.doc._id] = JSON.stringify(upsert.base);
        }
    }
    _deleteUpsert(id) {
        delete this.upserts[id];
        if (this.namespace) {
            window.localStorage[this.namespace + "upserts"] = JSON.stringify(lodash_1.default.keys(this.upserts));
        }
    }
    _putRemove(doc) {
        this.removes[doc._id] = doc;
        if (this.namespace) {
            window.localStorage[this.namespace + "removes"] = JSON.stringify(lodash_1.default.values(this.removes));
        }
    }
    _deleteRemove(id) {
        delete this.removes[id];
        if (this.namespace) {
            window.localStorage[this.namespace + "removes"] = JSON.stringify(lodash_1.default.values(this.removes));
        }
    }
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
                    // Exclude any excluded _ids from being cached/uncached
                    if (options && options.exclude && options.exclude.includes(result._id)) {
                        continue;
                    }
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
                    this._deleteItem(result._id);
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
            if (this.upserts[upsert.doc._id]) {
                // Only safely remove upsert if item is unchanged
                if (lodash_1.default.isEqual(upsert.doc, this.upserts[upsert.doc._id].doc)) {
                    this._deleteUpsert(upsert.doc._id);
                }
                else {
                    // Just update base
                    this.upserts[upsert.doc._id].base = upsert.doc;
                    this._putUpsert(this.upserts[upsert.doc._id]);
                }
            }
        }
        if (success != null) {
            return success();
        }
    }
    resolveRemove(id, success) {
        this._deleteRemove(id);
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
                this._putItem(doc);
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
                    this._putItem(doc);
                }
            }
        }
        if (success != null) {
            return success();
        }
    }
    uncache(selector, success, error) {
        const compiledSelector = utils.compileDocumentSelector(selector);
        for (let item of lodash_1.default.values(this.items)) {
            if (this.upserts[item._id] == null && compiledSelector(item)) {
                this._deleteItem(item._id);
            }
        }
        if (success != null) {
            return success();
        }
    }
    uncacheList(ids, success, error) {
        for (let id of ids) {
            if (this.upserts[id] == null) {
                this._deleteItem(id);
            }
        }
        if (success != null) {
            return success();
        }
    }
}
