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
exports.HybridCollection = void 0;
const lodash_1 = __importDefault(require("lodash"));
const utils_1 = require("./utils");
const utils = __importStar(require("./utils"));
/** Bridges a local and remote database, querying from the local first and then
 * getting the remote. Also uploads changes from local to remote.
 */
class HybridDb {
    constructor(localDb, remoteDb) {
        this.localDb = localDb;
        this.remoteDb = remoteDb;
        this.collections = {};
    }
    addCollection(name, options, success, error) {
        // Shift options over if not present
        if (lodash_1.default.isFunction(options)) {
            ;
            [options, success, error] = [{}, options, success];
        }
        const collection = new HybridCollection(name, this.localDb[name], this.remoteDb[name], options);
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
    upload(success, error) {
        const cols = Object.values(this.collections);
        function uploadCols(cols, success, error) {
            const col = lodash_1.default.first(cols);
            if (col) {
                col.upload(() => uploadCols(lodash_1.default.tail(cols), success, error), (err) => error(err));
            }
            else {
                success();
            }
        }
        return uploadCols(cols, success, error);
    }
    getCollectionNames() {
        return lodash_1.default.keys(this.collections);
    }
}
exports.default = HybridDb;
class HybridCollection {
    // Options includes
    constructor(name, localCol, remoteCol, options) {
        this.name = name;
        this.localCol = localCol;
        this.remoteCol = remoteCol;
        // Default options
        this.options = options || {};
        lodash_1.default.defaults(this.options, {
            cacheFind: true,
            cacheFindOne: true,
            interim: true,
            useLocalOnRemoteError: true,
            shortcut: false,
            timeout: 0,
            sortUpserts: null // Compare function to sort upserts sent to server
        });
    }
    find(selector, options = {}) {
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
        // Merge options
        lodash_1.default.defaults(options, this.options);
        // Happens after initial find
        const step2 = (localDoc) => {
            const findOptions = lodash_1.default.cloneDeep(options);
            findOptions.interim = false;
            findOptions.cacheFind = options.cacheFindOne;
            if (selector._id) {
                findOptions.limit = 1;
            }
            else {
                // Without _id specified, interaction between local and remote changes is complex
                // For example, if the one result returned by remote is locally deleted, we have no fallback
                // So instead we do a find with no limit and then take the first result, which is very inefficient
                delete findOptions.limit;
            }
            return this.find(selector, findOptions).fetch(function (data) {
                // Return first entry or null
                if (data.length > 0) {
                    // Check that different from existing
                    if (!lodash_1.default.isEqual(localDoc, data[0])) {
                        return success(data[0]);
                    }
                }
                else {
                    // If nothing found, always report it, as interim find doesn't return null
                    return success(null);
                }
            }, error);
        };
        // If interim or shortcut, get local first
        if (options.interim || options.shortcut) {
            return this.localCol.findOne(selector, options, function (localDoc) {
                // If found, return
                if (localDoc) {
                    success(lodash_1.default.cloneDeep(localDoc));
                    // If shortcut, we're done
                    if (options.shortcut) {
                        return;
                    }
                }
                return step2(localDoc);
            }, error);
        }
        else {
            return step2(null);
        }
    }
    _findFetch(selector, options, success, error) {
        // Merge options
        lodash_1.default.defaults(options, this.options);
        // Get pending removes and upserts immediately to avoid odd race conditions
        return this.localCol.pendingUpserts((upserts) => {
            return this.localCol.pendingRemoves((removes) => {
                const step2 = (localData) => {
                    // Setup remote options
                    const remoteOptions = lodash_1.default.cloneDeep(options);
                    // If caching, get all fields
                    if (options.cacheFind) {
                        delete remoteOptions.fields;
                    }
                    // Add localData to options for remote find for quickfind protocol
                    remoteOptions.localData = localData;
                    // Setup timer variables
                    let timer = null;
                    let timedOut = false;
                    const remoteSuccess = (remoteData) => {
                        // Cancel timer
                        if (timer) {
                            clearTimeout(timer);
                        }
                        // Ignore if timed out, caching asynchronously
                        if (timedOut) {
                            if (options.cacheFind) {
                                this.localCol.cache(remoteData, selector, options, function () { }, error);
                            }
                            return;
                        }
                        if (options.cacheFind) {
                            // Cache locally
                            const cacheSuccess = () => {
                                // Get local data again
                                function localSuccess2(localData2) {
                                    // Check if different or not interim
                                    if (!options.interim || !lodash_1.default.isEqual(localData, localData2)) {
                                        // Send again
                                        return success(localData2);
                                    }
                                }
                                return this.localCol.find(selector, options).fetch(localSuccess2, error);
                            };
                            // Exclude any recent upserts/removes to prevent race condition
                            const cacheOptions = lodash_1.default.extend({}, options, {
                                exclude: removes.concat(lodash_1.default.map(upserts, (u) => u.doc._id))
                            });
                            return this.localCol.cache(remoteData, selector, cacheOptions, cacheSuccess, error);
                        }
                        else {
                            // Remove local remotes
                            let data = remoteData;
                            if (removes.length > 0) {
                                const removesMap = lodash_1.default.fromPairs(lodash_1.default.map(removes, (id) => [id, id]));
                                data = lodash_1.default.filter(remoteData, (doc) => !lodash_1.default.has(removesMap, doc._id));
                            }
                            // Add upserts
                            if (upserts.length > 0) {
                                // Remove upserts from data
                                const upsertsMap = lodash_1.default.fromPairs(lodash_1.default.zip(lodash_1.default.map(upserts, (u) => u.doc._id), lodash_1.default.map(upserts, (u) => u.doc._id)));
                                data = lodash_1.default.filter(data, (doc) => !lodash_1.default.has(upsertsMap, doc._id));
                                // Add upserts
                                data = data.concat(lodash_1.default.map(upserts, "doc"));
                                // Refilter/sort/limit
                                data = (0, utils_1.processFind)(data, selector, options);
                            }
                            // Check if different or not interim
                            if (!options.interim || !lodash_1.default.isEqual(localData, data)) {
                                // Send again
                                return success(data);
                            }
                        }
                    };
                    const remoteError = (err) => {
                        // Cancel timer
                        if (timer) {
                            clearTimeout(timer);
                        }
                        if (timedOut) {
                            return;
                        }
                        // If no interim, do local find
                        if (!options.interim) {
                            if (options.useLocalOnRemoteError) {
                                return success(localData);
                            }
                            else {
                                if (error) {
                                    return error(err);
                                }
                            }
                        }
                        else {
                            // Otherwise do nothing
                            return;
                        }
                    };
                    // Start timer if remote
                    if (options.timeout) {
                        timer = setTimeout(() => {
                            timer = null;
                            timedOut = true;
                            // If no interim, do local find
                            if (!options.interim) {
                                if (options.useLocalOnRemoteError) {
                                    return this.localCol.find(selector, options).fetch(success, error);
                                }
                                else {
                                    if (error) {
                                        return error(new Error("Remote timed out"));
                                    }
                                }
                            }
                            else {
                                // Otherwise do nothing
                                return;
                            }
                        }, options.timeout);
                    }
                    return this.remoteCol.find(selector, remoteOptions).fetch(remoteSuccess, remoteError);
                };
                function localSuccess(localData) {
                    // If interim, return data immediately
                    if (options.interim) {
                        success(localData);
                    }
                    return step2(localData);
                }
                // Always get local data first
                return this.localCol.find(selector, options).fetch(localSuccess, error);
            }, error);
        }, error);
    }
    upsert(docs, bases, success, error) {
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        return this.localCol.upsert(lodash_1.default.map(items, "doc"), lodash_1.default.map(items, "base"), (result) => success === null || success === void 0 ? void 0 : success(docs), error);
    }
    remove(id, success, error) {
        return this.localCol.remove(id, function () {
            if (success != null) {
                return success();
            }
        }, error);
    }
    upload(success, error) {
        const uploadUpserts = (upserts, success, error) => {
            const upsert = lodash_1.default.first(upserts);
            if (upsert) {
                return this.remoteCol.upsert(upsert.doc, upsert.base, (remoteDoc) => {
                    return this.localCol.resolveUpserts([upsert], () => {
                        // Cache new value if present
                        if (remoteDoc) {
                            return this.localCol.cacheOne(remoteDoc, () => uploadUpserts(lodash_1.default.tail(upserts), success, error), error);
                        }
                        else {
                            // Remove local
                            return this.localCol.remove(upsert.doc._id, () => {
                                // Resolve remove
                                return this.localCol.resolveRemove(upsert.doc._id, () => uploadUpserts(lodash_1.default.tail(upserts), success, error), error);
                            }, error);
                        }
                    }, error);
                }, (err) => {
                    // If 410 error or 403, remove document
                    if (err.status === 410 || err.status === 403) {
                        return this.localCol.remove(upsert.doc._id, () => {
                            // Resolve remove
                            return this.localCol.resolveRemove(upsert.doc._id, function () {
                                // Continue if was 410
                                if (err.status === 410) {
                                    return uploadUpserts(lodash_1.default.tail(upserts), success, error);
                                }
                                else {
                                    return error(err);
                                }
                            }, error);
                        }, error);
                    }
                    else {
                        return error(err);
                    }
                });
            }
            else {
                return success();
            }
        };
        const uploadRemoves = (removes, success, error) => {
            const remove = lodash_1.default.first(removes);
            if (remove) {
                return this.remoteCol.remove(remove, () => {
                    return this.localCol.resolveRemove(remove, () => uploadRemoves(lodash_1.default.tail(removes), success, error), error);
                }, (err) => {
                    // If 403 or 410, remove document
                    if (err.status === 410 || err.status === 403) {
                        return this.localCol.resolveRemove(remove, function () {
                            // Continue if was 410
                            if (err.status === 410) {
                                return uploadRemoves(lodash_1.default.tail(removes), success, error);
                            }
                            else {
                                return error(err);
                            }
                        }, error);
                    }
                    else {
                        return error(err);
                    }
                });
            }
            else {
                success();
            }
        };
        // Get pending upserts
        this.localCol.pendingUpserts((upserts) => {
            // Sort upserts if sort defined
            if (this.options.sortUpserts) {
                upserts.sort((u1, u2) => this.options.sortUpserts(u1.doc, u2.doc));
            }
            return uploadUpserts(upserts, () => {
                return this.localCol.pendingRemoves((removes) => uploadRemoves(removes, success, error), error);
            }, error);
        }, error);
    }
}
exports.HybridCollection = HybridCollection;
