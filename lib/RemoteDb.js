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
const jQueryHttpClient_1 = __importDefault(require("./jQueryHttpClient"));
const quickfind = __importStar(require("./quickfind"));
const js_sha1_1 = __importDefault(require("js-sha1"));
class RemoteDb {
    /** Url must have trailing /, can be an arrau of URLs
     * useQuickFind enables the quickfind protocol for finds
     * usePostFind enables POST for find
     */
    constructor(url, client, httpClient, useQuickFind = false, usePostFind = false) {
        this.url = url;
        this.client = client;
        this.collections = {};
        this.httpClient = httpClient;
        this.useQuickFind = useQuickFind;
        this.usePostFind = usePostFind;
    }
    // Can specify url of specific collection as option.
    // useQuickFind can be overridden in options
    // usePostFind can be overridden in options
    addCollection(name, options = {}, success, error) {
        let url;
        if (lodash_1.default.isFunction(options)) {
            ;
            [options, success, error] = [{}, options, success];
        }
        if (options.url) {
            ;
            ({ url } = options);
        }
        else {
            if (lodash_1.default.isArray(this.url)) {
                url = lodash_1.default.map(this.url, (url) => url + name);
            }
            else {
                url = this.url + name;
            }
        }
        let { useQuickFind } = this;
        if (options.useQuickFind != null) {
            ;
            ({ useQuickFind } = options);
        }
        let { usePostFind } = this;
        if (options.usePostFind != null) {
            ;
            ({ usePostFind } = options);
        }
        const collection = new Collection(name, url, this.client, this.httpClient, useQuickFind, usePostFind);
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
exports.default = RemoteDb;
// Remote collection on server
class Collection {
    // usePostFind allows POST to <collection>/find for long selectors
    constructor(name, url, client, httpClient, useQuickFind, usePostFind) {
        this.name = name;
        this.url = url;
        this.client = client;
        this.httpClient = httpClient || jQueryHttpClient_1.default;
        this.useQuickFind = useQuickFind;
        this.usePostFind = usePostFind;
        this.urlIndex = 0;
    }
    /** Get a URL to use from an array, if present.
     * Stable if a GET request, but not if a POST, etc request
     * to allow caching. Accomplished by passing in a key
     * to use for hashing for GET only.
     */
    getUrl(key) {
        if (typeof this.url === "string") {
            return this.url;
        }
        // If no key, use next URL
        if (!key) {
            const url = this.url[this.urlIndex];
            this.urlIndex = (this.urlIndex + 1) % this.url.length;
            return url;
        }
        // Hash key to get index
        const hash = js_sha1_1.default.create();
        hash.update(key);
        // Get 4 hex digits
        const partial = hash.hex().substr(0, 4);
        // Convert to integer
        const index = parseInt(partial, 16);
        // Get URL
        return this.url[index % this.url.length];
    }
    // error is called with jqXHR
    find(selector, options = {}) {
        return {
            fetch: (success, error) => {
                return this._findFetch(selector, options, success, error);
            }
        };
    }
    _findFetch(selector, options, success, error) {
        // If promise case
        if (success == null) {
            return new Promise((resolve, reject) => {
                this._findFetch(selector, options, resolve, reject);
            });
        }
        // Determine method: "get", "post" or "quickfind"
        // If in quickfind and localData present and (no fields option or _rev included) and not (limit with no sort), use quickfind
        let method;
        if (this.useQuickFind &&
            options.localData &&
            (!options.fields || options.fields._rev) &&
            !(options.limit && !options.sort && !options.orderByExprs)) {
            method = "quickfind";
            // If selector or fields or sort is too big, use post
        }
        else if (this.usePostFind &&
            JSON.stringify({ selector, sort: options.sort, fields: options.fields }).length > 500) {
            method = "post";
        }
        else {
            method = "get";
        }
        if (method === "get") {
            // Create url
            const params = {};
            params.selector = JSON.stringify(selector || {});
            if (options.sort) {
                params.sort = JSON.stringify(options.sort);
            }
            if (options.limit) {
                params.limit = options.limit;
            }
            if (options.skip) {
                params.skip = options.skip;
            }
            if (options.fields) {
                params.fields = JSON.stringify(options.fields);
            }
            // Advanced options for mwater-expression-based filtering and ordering
            if (options.whereExpr) {
                params.whereExpr = JSON.stringify(options.whereExpr);
            }
            if (options.orderByExprs) {
                params.orderByExprs = JSON.stringify(options.orderByExprs);
            }
            if (this.client) {
                params.client = this.client;
            }
            this.httpClient("GET", this.getUrl(this.name + JSON.stringify(params)), params, null, success, error);
            return;
        }
        // Create body + params for quickfind and post
        const body = {
            selector: selector || {}
        };
        if (options.sort) {
            body.sort = options.sort;
        }
        if (options.limit != null) {
            body.limit = options.limit;
        }
        if (options.skip != null) {
            body.skip = options.skip;
        }
        if (options.fields) {
            body.fields = options.fields;
        }
        // Advanced options for mwater-expression-based filtering and ordering
        if (options.whereExpr) {
            body.whereExpr = options.whereExpr;
        }
        if (options.orderByExprs) {
            body.orderByExprs = options.orderByExprs;
        }
        const params = {};
        if (this.client) {
            params.client = this.client;
        }
        if (method === "quickfind") {
            // Send quickfind data
            body.quickfind = quickfind.encodeRequest(options.localData);
            this.httpClient("POST", this.getUrl() + "/quickfind", params, body, (encodedResponse) => {
                return success(quickfind.decodeResponse(encodedResponse, options.localData, options.sort));
            }, error);
            return;
        }
        // POST method
        this.httpClient("POST", this.getUrl() + "/find", params, body, (response) => {
            return success(response);
        }, error);
        return;
    }
    findOne(selector, options, success, error) {
        if (lodash_1.default.isFunction(options)) {
            ;
            [options, success, error] = [{}, options, success];
        }
        options = options || {};
        // If promise case
        if (success == null) {
            return new Promise((resolve, reject) => {
                this.findOne(selector, options, resolve, reject);
            });
        }
        // TODO would require documentation change and major bump
        // // Use simple GET if no options and selector is by _id only
        // if (_.isEmpty(options) && _.isEqual(selector, { _id: selector._id })) {
        //   return this.httpClient(
        //     "GET",
        //     this.getUrl(this.name + "/" + selector._id),
        //     { client: this.client },
        //     null,
        //     function (result: any) {
        //       success(result ?? null)
        //     },
        //     (jqXHR) => {
        //       if (jqXHR.status === 404) {
        //         return success(null)
        //       } else {
        //         return error(jqXHR)
        //       }
        //     }
        //   )
        // }
        // Create url
        const params = {};
        if (options.sort) {
            params.sort = JSON.stringify(options.sort);
        }
        params.limit = 1;
        if (this.client) {
            params.client = this.client;
        }
        params.selector = JSON.stringify(selector || {});
        return this.httpClient("GET", this.getUrl(this.name + "?" + JSON.stringify(params)), params, null, function (results) {
            if (results && results.length > 0) {
                return success(results[0]);
            }
            else {
                return success(null);
            }
        }, error);
    }
    upsert(docs, bases, success, error) {
        // If promise case
        if (!success && !lodash_1.default.isFunction(bases)) {
            return new Promise((resolve, reject) => {
                this.upsert(docs, bases, resolve, reject);
            });
        }
        let items;
        [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);
        const results = [];
        // Check if bases present
        const basesPresent = lodash_1.default.compact(lodash_1.default.map(items, "base")).length > 0;
        const params = {};
        if (this.client) {
            params.client = this.client;
        }
        // Handle single case
        if (items.length === 1) {
            // POST if no base, PATCH otherwise
            if (basesPresent) {
                return this.httpClient("PATCH", this.getUrl(), params, items[0], function (result) {
                    if (lodash_1.default.isArray(docs)) {
                        return success([result]);
                    }
                    else {
                        return success(result);
                    }
                }, function (err) {
                    if (error) {
                        return error(err);
                    }
                });
            }
            else {
                return this.httpClient("POST", this.getUrl(), params, items[0].doc, function (result) {
                    if (lodash_1.default.isArray(docs)) {
                        return success([result]);
                    }
                    else {
                        return success(result);
                    }
                }, function (err) {
                    if (error) {
                        return error(err);
                    }
                });
            }
        }
        else {
            // POST if no base, PATCH otherwise
            if (basesPresent) {
                return this.httpClient("PATCH", this.getUrl(), params, { doc: lodash_1.default.map(items, "doc"), base: lodash_1.default.map(items, "base") }, (result) => success(result), function (err) {
                    if (error) {
                        return error(err);
                    }
                });
            }
            else {
                return this.httpClient("POST", this.getUrl(), params, lodash_1.default.map(items, "doc"), (result) => success(result), function (err) {
                    if (error) {
                        return error(err);
                    }
                });
            }
        }
    }
    remove(id, success, error) {
        if (!success) {
            return new Promise((resolve, reject) => {
                this.remove(id, resolve, reject);
            });
        }
        if (!this.client) {
            throw new Error("Client required to remove");
        }
        const params = { client: this.client };
        return this.httpClient("DELETE", this.getUrl() + "/" + id, params, null, success, function (err) {
            // 410 is an acceptable delete status
            if (err.status === 410) {
                return success();
            }
            else {
                return error(err);
            }
        });
    }
}
