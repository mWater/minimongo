"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.regularizeUpsert = exports.createUid = exports.filterFields = exports.processFind = exports.cloneLocalCollection = exports.cloneLocalDb = exports.migrateLocalDb = exports.autoselectLocalDb = exports.compileDocumentSelector = void 0;
// Utilities for db handling
const lodash_1 = __importDefault(require("lodash"));
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
const distance_1 = __importDefault(require("@turf/distance"));
const nearest_point_on_line_1 = __importDefault(require("@turf/nearest-point-on-line"));
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
    // Browsers with no localStorage support don't deserve anything better than a MemoryDb
    if (!isLocalStorageSupported()) {
        return new MemoryDb_1.default(options, success);
    }
    // Always use WebSQL plugin in cordova iOS only
    if (window["cordova"]) {
        if (((_a = window["device"]) === null || _a === void 0 ? void 0 : _a.platform) === "iOS" && window["sqlitePlugin"]) {
            console.log("Selecting WebSQLDb(sqlite) for Cordova");
            options.storage = "sqlite";
            return new WebSQLDb_1.default(options, success, error);
        }
    }
    // Always use IndexedDb in browser if supported
    if (window.indexedDB) {
        console.log("Selecting IndexedDb for browser");
        return new IndexedDb_1.default(options, success, (err) => {
            console.log("Failed to create IndexedDb: " + (err ? err.message : undefined));
            // Create LocalStorageDb instead
            return new LocalStorageDb_1.default(options, success, (err) => {
                console.log("Failed to create LocalStorageDb: " + (err ? err.message : undefined));
                // Create MemoryDb instead
                return new MemoryDb_1.default(options, success);
            });
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
function cloneLocalDb(fromDb, toDb, success, error) {
    if (!success && !error) {
        return new Promise((resolve, reject) => {
            cloneLocalDb(fromDb, toDb, resolve, reject);
        });
    }
    function clone() {
        return __awaiter(this, void 0, void 0, function* () {
            // Create collections in toDb for all collections in fromDb
            for (const name in fromDb.collections) {
                if (!toDb.collections[name]) {
                    yield new Promise((resolve, reject) => {
                        toDb.addCollection(name, resolve, reject);
                    });
                }
            }
            // Clone each collection in parallel
            yield Promise.all(Object.values(fromDb.collections).map((fromCol) => {
                return cloneLocalCollection(fromCol, toDb.collections[fromCol.name]);
            }));
        });
    }
    clone().then(success).catch(error);
}
exports.cloneLocalDb = cloneLocalDb;
function cloneLocalCollection(fromCol, toCol, success, error) {
    if (!success && !error) {
        return new Promise((resolve, reject) => {
            cloneLocalCollection(fromCol, toCol, resolve, reject);
        });
    }
    function clone() {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all items
            const items = yield fromCol.find({}).fetch();
            // Seed items
            yield new Promise((resolve, reject) => {
                toCol.seed(items, resolve, reject);
            });
            // Copy upserts
            const upserts = yield new Promise((resolve, reject) => {
                fromCol.pendingUpserts(resolve, reject);
            });
            // Upsert items
            yield toCol.upsert(upserts.map((item) => item.doc), upserts.map((item) => item.base));
            // Copy removes
            const removes = yield new Promise((resolve, reject) => {
                fromCol.pendingRemoves(resolve, reject);
            });
            // Remove items
            for (let remove of removes) {
                yield toCol.remove(remove);
            }
        });
    }
    clone().then(success).catch(error);
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
        filtered = filterFields(filtered, options.fields);
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
            item = JSON.parse(JSON.stringify(item));
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
            // Filter to points and lines
            list = lodash_1.default.filter(list, (doc) => doc[key] && (doc[key].type === "Point" || doc[key].type === "LineString"));
            // Get distances
            let distances = lodash_1.default.map(list, (doc) => ({
                doc,
                distance: getDistance(geo, doc[key])
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
function getDistance(from, to) {
    if (to.type === "Point") {
        return (0, distance_1.default)(from, to, { units: "meters" });
    }
    if (to.type === "LineString") {
        const nearest = (0, nearest_point_on_line_1.default)(to, from, { units: "meters" });
        return nearest.properties.dist;
    }
    throw new Error("Unsupported type");
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
                    // Special case for empty line string (bug Dec 2023)
                    if (doc[key].coordinates.length === 0) {
                        return false;
                    }
                    return (0, boolean_crosses_1.default)(doc[key], geo) || (0, boolean_within_1.default)(doc[key], geo);
                }
                else if (doc[key].type === "MultiLineString") {
                    // Bypass deficiencies in turf.js by splitting it up
                    for (let line of doc[key].coordinates) {
                        const lineGeo = { type: "LineString", coordinates: line };
                        // Special case for empty line string (bug Dec 2023)
                        if (lineGeo.coordinates.length === 0) {
                            continue;
                        }
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
            item.doc._id = createUid();
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
