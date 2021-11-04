"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.regularizeUpsert = exports.createUid = exports.filterFields = exports.processFind = exports.cloneLocalCollection = exports.cloneLocalDb = exports.migrateLocalDb = exports.autoselectLocalDb = exports.compileDocumentSelector = void 0;
// Utilities for db handling
const lodash_1 = __importDefault(require("lodash"));
const async_1 = __importDefault(require("async"));
const bowser_1 = __importDefault(require("bowser"));
const selector_1 = require("./selector");
Object.defineProperty(exports, "compileDocumentSelector", { enumerable: true, get: function () { return selector_1.compileDocumentSelector; } });
const boolean_point_in_polygon_1 = __importDefault(require("@turf/boolean-point-in-polygon"));
const intersect_1 = __importDefault(require("@turf/intersect"));
const boolean_crosses_1 = __importDefault(require("@turf/boolean-crosses"));
const boolean_within_1 = __importDefault(require("@turf/boolean-within"));
const IndexedDb_1 = __importDefault(require("./IndexedDb"));
const WebSQLDb_1 = __importDefault(require("./WebSQLDb"));
const LocalStorageDb_1 = __importDefault(require("./LocalStorageDb"));
const MemoryDb_1 = __importDefault(require("./MemoryDb"));
const HybridDb_1 = __importDefault(require("./HybridDb"));
// Test window.localStorage
function isLocalStorageSupported() {
    if (!window.localStorage) {
        return false;
    }
    try {
        window.localStorage.setItem("test", "test");
        window.localStorage.removeItem("test");
        return true;
    }
    catch (e) {
        return false;
    }
}
// Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
function autoselectLocalDb(options, success, error) {
    var _a;
    // Get browser capabilities
    const { browser } = bowser_1.default;
    // Browsers with no localStorage support don't deserve anything better than a MemoryDb
    if (!isLocalStorageSupported()) {
        return new MemoryDb_1.default(options, success);
    }
    // Always use WebSQL in cordova
    if (window["cordova"]) {
        if (((_a = window["device"]) === null || _a === void 0 ? void 0 : _a.platform) === "iOS" && window["sqlitePlugin"]) {
            console.log("Selecting WebSQLDb(sqlite) for Cordova");
            options.storage = "sqlite";
            return new WebSQLDb_1.default(options, success, error);
        }
        else {
            console.log("Selecting else WebSQLDb for Cordova");
            // WebSQLDb must success in Cordova
            return new WebSQLDb_1.default(options, success, error);
        }
    }
    // Use IndexedDb for ios, Safari
    if (browser.ios || browser.safari) {
        // Fallback to IndexedDb
        return new IndexedDb_1.default(options, success, (err) => {
            console.log("Failed to create IndexedDb: " + (err ? err.message : undefined));
            // Create memory db instead
            return new MemoryDb_1.default(options, success);
        });
    }
    // Use WebSQL in Android, Chrome,  Opera, Blackberry if supports it
    if (browser.android || browser.chrome || browser.opera || browser.blackberry) {
        if (typeof window["openDatabase"] === "function") {
            console.log("Selecting WebSQLDb for browser");
            return new WebSQLDb_1.default(options, success, (err) => {
                console.log("Failed to create WebSQLDb: " + (err ? err.message : undefined));
                // Fallback to IndexedDb
                return new IndexedDb_1.default(options, success, (err) => {
                    console.log("Failed to create IndexedDb: " + (err ? err.message : undefined));
                    // Create memory db instead
                    return new MemoryDb_1.default(options, success);
                });
            });
        }
        else {
            // Fallback to IndexedDb
            console.log("Selecting IndexedDb for browser as WebSQL not supported");
            return new IndexedDb_1.default(options, success, (err) => {
                console.log("Failed to create IndexedDb: " + (err ? err.message : undefined));
                // Create memory db instead
                return new MemoryDb_1.default(options, success);
            });
        }
    }
    // Use IndexedDb on Firefox >= 16
    if (browser.firefox && browser.version >= 16) {
        console.log("Selecting IndexedDb for browser");
        return new IndexedDb_1.default(options, success, (err) => {
            console.log("Failed to create IndexedDb: " + (err ? err.message : undefined));
            // Create memory db instead
            return new MemoryDb_1.default(options, success);
        });
    }
    // Use Local Storage otherwise
    console.log("Selecting LocalStorageDb for fallback");
    return new LocalStorageDb_1.default(options, success, error);
}
exports.autoselectLocalDb = autoselectLocalDb;
// Migrates a local database's pending upserts and removes from one database to another
// Useful for upgrading from one type of database to another
function migrateLocalDb(fromDb, toDb, success, error) {
    // Migrate collection using a HybridDb
    const hybridDb = new HybridDb_1.default(fromDb, toDb);
    for (let name in fromDb.collections) {
        const col = fromDb.collections[name];
        if (toDb[name]) {
            hybridDb.addCollection(name);
        }
    }
    return hybridDb.upload(success, error);
}
exports.migrateLocalDb = migrateLocalDb;
/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
function cloneLocalDb(fromDb, toDb, success, error) {
    let name;
    for (name in fromDb.collections) {
        // TODO Assumes synchronous addCollection
        const col = fromDb.collections[name];
        if (!toDb[name]) {
            toDb.addCollection(name);
        }
    }
    // First cache all data
    return async_1.default.each(lodash_1.default.values(fromDb.collections), ((fromCol, cb) => {
        const toCol = toDb[fromCol.name];
        // Get all items
        return fromCol.find({}).fetch((items) => {
            // Seed items
            return toCol.seed(items, () => {
                // Copy upserts
                return fromCol.pendingUpserts((upserts) => {
                    return toCol.upsert(lodash_1.default.map(upserts, "doc"), lodash_1.default.map(upserts, "base"), () => {
                        // Copy removes
                        return fromCol.pendingRemoves((removes) => {
                            return async_1.default.eachSeries(removes, ((remove, cb2) => {
                                return toCol.remove(remove, () => {
                                    return cb2();
                                }, cb2);
                            }), cb);
                        }, cb);
                    }, cb);
                }, cb);
            }, cb);
        }, cb);
    }), (err) => {
        if (err) {
            return error(err);
        }
        return success();
    });
}
exports.cloneLocalDb = cloneLocalDb;
/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
function cloneLocalCollection(fromCol, toCol, success, error) {
    // Get all items
    return fromCol.find({}).fetch((items) => {
        // Seed items
        return toCol.seed(items, () => {
            // Copy upserts
            return fromCol.pendingUpserts((upserts) => {
                return toCol.upsert(lodash_1.default.map(upserts, "doc"), lodash_1.default.map(upserts, "base"), () => {
                    // Copy removes
                    return fromCol.pendingRemoves((removes) => {
                        const iterator = (remove, cb2) => {
                            return toCol.remove(remove, () => {
                                return cb2();
                            }, cb2);
                        };
                        return async_1.default.eachSeries(removes, iterator, (err) => {
                            if (err) {
                                return error(err);
                            }
                            return success();
                        });
                    }, error);
                }, error);
            }, error);
        }, error);
    }, error);
}
exports.cloneLocalCollection = cloneLocalCollection;
// Processes a find with sorting and filtering and limiting
function processFind(items, selector, options) {
    let filtered = lodash_1.default.filter(items, (0, selector_1.compileDocumentSelector)(selector));
    // Handle geospatial operators
    filtered = processNearOperator(selector, filtered);
    filtered = processGeoIntersectsOperator(selector, filtered);
    if (options && options.sort) {
        filtered.sort((0, selector_1.compileSort)(options.sort));
    }
    if (options && options.skip) {
        filtered = lodash_1.default.slice(filtered, options.skip);
    }
    if (options && options.limit) {
        filtered = lodash_1.default.take(filtered, options.limit);
    }
    // Apply fields if present
    if (options && options.fields) {
        filtered = exports.filterFields(filtered, options.fields);
    }
    return filtered;
}
exports.processFind = processFind;
/** Include/exclude fields in mongo-style */
function filterFields(items, fields = {}) {
    // Handle trivial case
    if (lodash_1.default.keys(fields).length === 0) {
        return items;
    }
    // For each item
    return lodash_1.default.map(items, function (item) {
        let field, obj, path, pathElem;
        const newItem = {};
        if (lodash_1.default.first(lodash_1.default.values(fields)) === 1) {
            // Include fields
            for (field of lodash_1.default.keys(fields).concat(["_id"])) {
                path = field.split(".");
                // Determine if path exists
                obj = item;
                for (pathElem of path) {
                    if (obj) {
                        obj = obj[pathElem];
                    }
                }
                if (obj == null) {
                    continue;
                }
                // Go into path, creating as necessary
                let from = item;
                let to = newItem;
                for (pathElem of lodash_1.default.initial(path)) {
                    to[pathElem] = to[pathElem] || {};
                    // Move inside
                    to = to[pathElem];
                    from = from[pathElem];
                }
                // Copy value
                to[lodash_1.default.last(path)] = from[lodash_1.default.last(path)];
            }
            return newItem;
        }
        else {
            // Deep clone as we will be deleting keys from item to exclude fields
            item = lodash_1.default.cloneDeep(item);
            // Exclude fields
            for (field of lodash_1.default.keys(fields)) {
                path = field.split(".");
                // Go inside path
                obj = item;
                for (pathElem of lodash_1.default.initial(path)) {
                    if (obj) {
                        obj = obj[pathElem];
                    }
                }
                // If not there, don't exclude
                if (obj == null) {
                    continue;
                }
                delete obj[lodash_1.default.last(path)];
            }
            return item;
        }
    });
}
exports.filterFields = filterFields;
// Creates a unique identifier string
function createUid() {
    return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
exports.createUid = createUid;
function processNearOperator(selector, list) {
    for (var key in selector) {
        var value = selector[key];
        if (value != null && value["$near"]) {
            var geo = value["$near"]["$geometry"];
            if (geo.type !== "Point") {
                break;
            }
            list = lodash_1.default.filter(list, (doc) => doc[key] && doc[key].type === "Point");
            // Get distances
            let distances = lodash_1.default.map(list, (doc) => ({
                doc,
                distance: getDistanceFromLatLngInM(geo.coordinates[1], geo.coordinates[0], doc[key].coordinates[1], doc[key].coordinates[0])
            }));
            // Filter non-points
            distances = lodash_1.default.filter(distances, (item) => item.distance >= 0);
            // Sort by distance
            distances = lodash_1.default.sortBy(distances, "distance");
            // Filter by maxDistance
            if (value["$near"]["$maxDistance"]) {
                distances = lodash_1.default.filter(distances, (item) => item.distance <= value["$near"]["$maxDistance"]);
            }
            // Extract docs
            list = lodash_1.default.map(distances, "doc");
        }
    }
    return list;
}
function pointInPolygon(point, polygon) {
    return (0, boolean_point_in_polygon_1.default)(point, polygon);
}
function polygonIntersection(polygon1, polygon2) {
    return (0, intersect_1.default)(polygon1, polygon2) != null;
}
// From http://www.movable-type.co.uk/scripts/latlong.html
function getDistanceFromLatLngInM(lat1, lng1, lat2, lng2) {
    const R = 6370986; // Radius of the earth in m
    const dLat = deg2rad(lat2 - lat1); // deg2rad below
    const dLng = deg2rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in m
    return d;
}
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
function processGeoIntersectsOperator(selector, list) {
    for (var key in selector) {
        const value = selector[key];
        if (value != null && value["$geoIntersects"]) {
            var geo = value["$geoIntersects"]["$geometry"];
            // Can only test intersection with polygon
            if (geo.type !== "Polygon") {
                break;
            }
            // Check within for each
            list = lodash_1.default.filter(list, function (doc) {
                // Ignore if null
                if (!doc[key]) {
                    return false;
                }
                // Check point or polygon
                if (doc[key].type === "Point") {
                    return pointInPolygon(doc[key], geo);
                }
                else if (["Polygon", "MultiPolygon"].includes(doc[key].type)) {
                    return polygonIntersection(doc[key], geo);
                }
                else if (doc[key].type === "LineString") {
                    return (0, boolean_crosses_1.default)(doc[key], geo) || (0, boolean_within_1.default)(doc[key], geo);
                }
                else if (doc[key].type === "MultiLineString") {
                    // Bypass deficiencies in turf.js by splitting it up
                    for (let line of doc[key].coordinates) {
                        const lineGeo = { type: "LineString", coordinates: line };
                        if ((0, boolean_crosses_1.default)(lineGeo, geo) || (0, boolean_within_1.default)(lineGeo, geo)) {
                            return true;
                        }
                    }
                    return false;
                }
            });
        }
    }
    return list;
}
/** Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> },
 * doing basic error checking and making sure that _id is present
 * Returns [items, success, error]
 */
function regularizeUpsert(docs, bases, success, error) {
    // Handle case of bases not present
    if (lodash_1.default.isFunction(bases)) {
        ;
        [bases, success, error] = [undefined, bases, success];
    }
    // Handle single upsert
    if (!lodash_1.default.isArray(docs)) {
        docs = [docs];
        bases = [bases];
    }
    else {
        bases = bases || [];
    }
    // Make into list of { doc: .., base: }
    const items = lodash_1.default.map(docs, (doc, i) => ({
        doc,
        base: i < bases.length ? bases[i] : undefined
    }));
    // Set _id
    for (let item of items) {
        if (!item.doc._id) {
            item.doc._id = exports.createUid();
        }
        if (item.base && !item.base._id) {
            throw new Error("Base needs _id");
        }
        if (item.base && item.base._id !== item.doc._id) {
            throw new Error("Base needs same _id");
        }
    }
    return [items, success, error];
}
exports.regularizeUpsert = regularizeUpsert;
