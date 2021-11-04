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
// Do nothing callback for success
function doNothing() { }
// WebSQLDb adapter for minimongo DB
// Supports sqlite plugin, if available and specified in option as {storage: 'sqlite'}
class WebSQLDb {
    constructor(options, success, error) {
        this.collections = {};
        if (options.storage === "sqlite" && window["sqlitePlugin"]) {
            // sqlite plugin does not support db.version
            // and since db operations can only be executed once the db is properly open
            // we add the schema version migration to the success callback
            window["sqlitePlugin"].openDatabase({ name: "minimongo_" + options.namespace, location: "default" }, (sqliteDb) => {
                console.log("Database open successful");
                this.db = sqliteDb;
                console.log("Checking version");
                this.db.executeSql("PRAGMA user_version", [], (rs) => {
                    const version = rs.rows.item(0).user_version;
                    if (version === 0) {
                        this.db.transaction((tx) => {
                            tx.executeSql(`\
CREATE TABLE docs (
col TEXT NOT NULL,
id TEXT NOT NULL,
state TEXT NOT NULL,
doc TEXT,
base TEXT,
PRIMARY KEY (col, id));`, [], doNothing, (tx, err) => error(err));
                            tx.executeSql("PRAGMA user_version = 2", [], doNothing, (tx, err) => error(err));
                            return success(this);
                        });
                    }
                    else {
                        success(this);
                    }
                }, function (err) {
                    console.log("version check error :: ", JSON.stringify(err));
                    error(err);
                });
            }, function (err) {
                console.log("Error opening databse :: ", JSON.stringify(err));
                error(err);
            });
        }
        else {
            try {
                // Create database
                // TODO escape name
                this.db = window["openDatabase"]("minimongo_" + options.namespace, "", "Minimongo:" + options.namespace, 5 * 1024 * 1024);
                if (!this.db) {
                    return error(new Error("Failed to create database"));
                }
            }
            catch (ex) {
                if (error) {
                    error(ex);
                }
                return;
            }
        }
        const migrateToV1 = (tx) => tx.executeSql(`\
CREATE TABLE docs (
col TEXT NOT NULL,
id TEXT NOT NULL,
state TEXT NOT NULL,
doc TEXT,
PRIMARY KEY (col, id));`, [], doNothing, (tx, err) => error(err));
        const migrateToV2 = (tx) => tx.executeSql(`\
ALTER TABLE docs ADD COLUMN base TEXT;`, [], doNothing, (tx, err) => error(err));
        // Check if at v2 version
        const checkV2 = () => {
            if (this.db.version === "1.0") {
                return this.db.changeVersion("1.0", "2.0", migrateToV2, error, () => {
                    if (success) {
                        return success(this);
                    }
                });
            }
            else if (this.db.version !== "2.0") {
                return error("Unknown db version " + this.db.version);
            }
            else {
                if (success) {
                    return success(this);
                }
            }
        };
        if (!options.storage) {
            if (!this.db.version) {
                this.db.changeVersion("", "1.0", migrateToV1, error, checkV2);
            }
            else {
                checkV2();
            }
        }
        return this.db;
    }
    addCollection(name, success, error) {
        const collection = new Collection(name, this.db);
        this[name] = collection;
        this.collections[name] = collection;
        if (success) {
            return success();
        }
    }
    removeCollection(name, success, error) {
        delete this[name];
        delete this.collections[name];
        // Remove all documents of collection
        return this.db.transaction((tx) => tx.executeSql("DELETE FROM docs WHERE col = ?", [name], success, (tx, err) => error(err)), error);
    }
    getCollectionNames() {
        return lodash_1.default.keys(this.collections);
    }
}
exports.default = WebSQLDb;
// Stores data in indexeddb store
class Collection {
    constructor(name, db) {
        this.name = name;
        this.db = db;
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
        // Android 2.x requires error callback
        error = error || function () { };
        // Get all docs from collection
        return this.db.readTransaction((tx) => {
            return tx.executeSql("SELECT * FROM docs WHERE col = ?", [this.name], function (tx, results) {
                const docs = [];
                for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    const row = results.rows.item(i);
                    if (row.state !== "removed") {
                        docs.push(JSON.parse(row.doc));
                    }
                }
                if (success != null) {
                    return success((0, utils_1.processFind)(docs, selector, options));
                }
            }, (tx, err) => error(err));
        }, error);
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            const ids = lodash_1.default.map(items, (item) => item.doc._id);
            // Get bases
            bases = {};
            return async_1.default.eachSeries(ids, ((id, callback) => {
                return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, id], function (tx2, results) {
                    tx = tx2;
                    if (results.rows.length > 0) {
                        const row = results.rows.item(0);
                        if (row.state === "upserted") {
                            bases[row.id] = row.base ? JSON.parse(row.base) : null;
                        }
                        else if (row.state === "cached") {
                            bases[row.id] = JSON.parse(row.doc);
                        }
                    }
                    return callback();
                }, (tx, err) => error(err));
            }), () => {
                return (() => {
                    const result = [];
                    for (let item of items) {
                        var base;
                        const id = item.doc._id;
                        // Prefer explicit base
                        if (item.base !== undefined) {
                            ;
                            ({ base } = item);
                        }
                        else if (bases[id]) {
                            base = bases[id];
                        }
                        else {
                            base = null;
                        }
                        result.push(tx.executeSql("INSERT OR REPLACE INTO docs (col, id, state, doc, base) VALUES (?, ?, ?, ?, ?)", [this.name, item.doc._id, "upserted", JSON.stringify(item.doc), JSON.stringify(base)], doNothing, (tx, err) => error(err)));
                    }
                    return result;
                })();
            });
        }, error, function () {
            if (success) {
                return success(docs);
            }
        });
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
        // Android 2.x requires error callback
        error = error || function () { };
        // Find record
        return this.db.transaction((tx) => {
            return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, id], (tx, results) => {
                if (results.rows.length > 0) {
                    // Change to removed
                    return tx.executeSql('UPDATE docs SET state="removed" WHERE col = ? AND id = ?', [this.name, id], function () {
                        if (success) {
                            return success(id);
                        }
                    }, (tx, err) => error(err));
                }
                else {
                    return tx.executeSql("INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [this.name, id, "removed", JSON.stringify({ _id: id })], function () {
                        if (success) {
                            return success(id);
                        }
                    }, (tx, err) => error(err));
                }
            }, (tx, err) => error(err));
        }, error);
    }
    cache(docs, selector, options, success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            // Add all non-local that are not upserted or removed
            return async_1.default.eachSeries(docs, ((doc, callback) => {
                return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, doc._id], (tx, results) => {
                    // Check if present and not upserted/deleted
                    if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
                        const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null;
                        // Exclude any excluded _ids from being cached/uncached
                        if (options && options.exclude && options.exclude.includes(doc._id)) {
                            callback();
                            return;
                        }
                        // If _rev present, make sure that not overwritten by lower or equal _rev
                        if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
                            // Upsert
                            return tx.executeSql("INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [this.name, doc._id, "cached", JSON.stringify(doc)], () => callback(), (tx, err) => error(err));
                        }
                        else {
                            return callback();
                        }
                    }
                    else {
                        return callback();
                    }
                }, (tx, err) => error(err));
            }), (err) => {
                let sort;
                if (err) {
                    if (error) {
                        error(err);
                    }
                    return;
                }
                // Rows have been cached, now look for stale ones to remove
                const docsMap = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(docs, "_id"), docs));
                if (options.sort) {
                    sort = (0, selector_1.compileSort)(options.sort);
                }
                // Perform query, removing rows missing in docs from local db
                return this.find(selector, options).fetch((results) => {
                    return this.db.transaction((tx) => {
                        return async_1.default.eachSeries(results, ((result, callback) => {
                            // If not present in docs and is present locally and not upserted/deleted
                            return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, result._id], (tx, rows) => {
                                if (!docsMap[result._id] && rows.rows.length > 0 && rows.rows.item(0).state === "cached") {
                                    // Exclude any excluded _ids from being cached/uncached
                                    if (options && options.exclude && options.exclude.includes(result._id)) {
                                        callback();
                                        return;
                                    }
                                    // If at limit
                                    if (options.limit && docs.length === options.limit) {
                                        // If past end on sorted limited, ignore
                                        if (options.sort && sort(result, lodash_1.default.last(docs)) >= 0) {
                                            return callback();
                                        }
                                        // If no sort, ignore
                                        if (!options.sort) {
                                            return callback();
                                        }
                                    }
                                    // Item is gone from server, remove locally
                                    return tx.executeSql("DELETE FROM docs WHERE col = ? AND id = ?", [this.name, result._id], () => callback(), (tx, err) => error(err));
                                }
                                else {
                                    return callback();
                                }
                            }, (tx, err) => error(err));
                        }), function (err) {
                            if (err != null) {
                                if (error != null) {
                                    error(err);
                                }
                                return;
                            }
                            if (success != null) {
                                return success();
                            }
                        });
                    }, error);
                }, error);
            });
        }, error);
    }
    pendingUpserts(success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.readTransaction((tx) => {
            return tx.executeSql("SELECT * FROM docs WHERE col = ? AND state = ?", [this.name, "upserted"], function (tx, results) {
                const docs = [];
                for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    const row = results.rows.item(i);
                    docs.push({ doc: JSON.parse(row.doc), base: row.base ? JSON.parse(row.base) : null });
                }
                if (success != null) {
                    return success(docs);
                }
            }, (tx, err) => error(err));
        }, error);
    }
    pendingRemoves(success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.readTransaction((tx) => {
            return tx.executeSql("SELECT * FROM docs WHERE col = ? AND state = ?", [this.name, "removed"], function (tx, results) {
                const docs = [];
                for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    const row = results.rows.item(i);
                    docs.push(JSON.parse(row.doc)._id);
                }
                if (success != null) {
                    return success(docs);
                }
            }, (tx, err) => error(err));
        }, error);
    }
    resolveUpserts(upserts, success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        // Find records
        return this.db.transaction((tx) => {
            return async_1.default.eachSeries(upserts, ((upsert, cb) => {
                return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, upsert.doc._id], (tx, results) => {
                    if (results.rows.length > 0 && results.rows.item(0).state === "upserted") {
                        // Only safely remove upsert if doc is the same
                        if (lodash_1.default.isEqual(JSON.parse(results.rows.item(0).doc), upsert.doc)) {
                            tx.executeSql('UPDATE docs SET state="cached" WHERE col = ? AND id = ?', [this.name, upsert.doc._id], doNothing, (tx, err) => error(err));
                            return cb();
                        }
                        else {
                            tx.executeSql("UPDATE docs SET base=? WHERE col = ? AND id = ?", [JSON.stringify(upsert.doc), this.name, upsert.doc._id], doNothing, (tx, err) => error(err));
                            return cb();
                        }
                    }
                    else {
                        // Upsert removed, which is fine
                        return cb();
                    }
                }, (tx, err) => error(err));
            }), function (err) {
                if (err) {
                    return error(err);
                }
                // Success
                if (success) {
                    return success();
                }
            });
        }, error);
    }
    resolveRemove(id, success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        // Find record
        return this.db.transaction((tx) => {
            // Only safely remove if removed state
            return tx.executeSql('DELETE FROM docs WHERE state="removed" AND col = ? AND id = ?', [this.name, id], function () {
                if (success) {
                    return success(id);
                }
            }, (tx, err) => error(err));
        }, error);
    }
    // Add but do not overwrite or record as upsert
    seed(docs, success, error) {
        if (!lodash_1.default.isArray(docs)) {
            docs = [docs];
        }
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            // Add all non-local that are not upserted or removed
            return async_1.default.eachSeries(docs, ((doc, callback) => {
                return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, doc._id], (tx, results) => {
                    // Check if present
                    if (results.rows.length === 0) {
                        // Upsert
                        return tx.executeSql("INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [this.name, doc._id, "cached", JSON.stringify(doc)], () => callback(), (tx, err) => error(err));
                    }
                    else {
                        return callback();
                    }
                }, (tx, err) => error(err));
            }), (err) => {
                if (err) {
                    if (error) {
                        return error(err);
                    }
                }
                else {
                    if (success) {
                        return success();
                    }
                }
            });
        }, error);
    }
    // Add but do not overwrite upsert/removed and do not record as upsert
    cacheOne(doc, success, error) {
        return this.cacheList([doc], success, error);
    }
    cacheList(docs, success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            // Add all non-local that are not upserted or removed
            return async_1.default.eachSeries(docs, ((doc, callback) => {
                return tx.executeSql("SELECT * FROM docs WHERE col = ? AND id = ?", [this.name, doc._id], (tx, results) => {
                    // Only insert if not present or cached
                    if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
                        const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null;
                        // If _rev present, make sure that not overwritten by lower or equal _rev
                        if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
                            return tx.executeSql("INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [this.name, doc._id, "cached", JSON.stringify(doc)], () => callback(), (tx, err) => callback(err));
                        }
                        else {
                            return callback();
                        }
                    }
                    else {
                        return callback();
                    }
                }, (tx, err) => callback(err));
            }), (err) => {
                if (err) {
                    if (error) {
                        return error(err);
                    }
                }
                else {
                    if (success) {
                        return success(docs);
                    }
                }
            });
        }, error);
    }
    uncache(selector, success, error) {
        const compiledSelector = utils.compileDocumentSelector(selector);
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            return tx.executeSql("SELECT * FROM docs WHERE col = ? AND state = ?", [this.name, "cached"], (tx, results) => {
                // Determine which to remove
                const toRemove = [];
                for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    const row = results.rows.item(i);
                    const doc = JSON.parse(row.doc);
                    if (compiledSelector(doc)) {
                        toRemove.push(doc._id);
                    }
                }
                // Add all non-local that are not upserted or removed
                return async_1.default.eachSeries(toRemove, ((id, callback) => {
                    // Only safely remove if removed state
                    return tx.executeSql('DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?', [this.name, id], () => callback(), (tx, err) => error(err));
                }), (err) => {
                    if (err) {
                        if (error) {
                            return error(err);
                        }
                    }
                    else {
                        if (success) {
                            return success();
                        }
                    }
                });
            }, (tx, err) => error(err));
        }, error);
    }
    uncacheList(ids, success, error) {
        // Android 2.x requires error callback
        error = error || function () { };
        return this.db.transaction((tx) => {
            // Add all non-local that are not upserted or removed
            return async_1.default.eachSeries(ids, ((id, callback) => {
                // Only safely remove if removed state
                return tx.executeSql('DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?', [this.name, id], () => callback(), (tx, err) => error(err));
            }), (err) => {
                if (err) {
                    if (error) {
                        return error(err);
                    }
                }
                else {
                    if (success) {
                        return success();
                    }
                }
            });
        }, error);
    }
}
