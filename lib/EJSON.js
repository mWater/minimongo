"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
var EJSON = {};
var customTypes = {};
// Add a custom type, using a method of your choice to get to and
// from a basic JSON-able representation.  The factory argument
// is a function of JSON-able --> your object
// The type you add must have:
// - A clone() method, so that Meteor can deep-copy it when necessary.
// - A equals() method, so that Meteor can compare it
// - A toJSONValue() method, so that Meteor can serialize it
// - a typeName() method, to show how to look it up in our type table.
// It is okay if these methods are monkey-patched on.
EJSON.addType = function (name, factory) {
    if (lodash_1.default.has(customTypes, name))
        throw new Error("Type " + name + " already present");
    customTypes[name] = factory;
};
var builtinConverters = [
    {
        // Date
        matchJSONValue: function (obj) {
            return lodash_1.default.has(obj, "$date") && lodash_1.default.size(obj) === 1;
        },
        matchObject: function (obj) {
            return obj instanceof Date;
        },
        toJSONValue: function (obj) {
            return { $date: obj.getTime() };
        },
        fromJSONValue: function (obj) {
            return new Date(obj.$date);
        }
    },
    {
        // Binary
        matchJSONValue: function (obj) {
            return lodash_1.default.has(obj, "$binary") && lodash_1.default.size(obj) === 1;
        },
        matchObject: function (obj) {
            return ((typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) || (obj && lodash_1.default.has(obj, "$Uint8ArrayPolyfill")));
        },
        toJSONValue: function (obj) {
            return { $binary: EJSON._base64Encode(obj) };
        },
        fromJSONValue: function (obj) {
            return EJSON._base64Decode(obj.$binary);
        }
    },
    {
        // Escaping one level
        matchJSONValue: function (obj) {
            return lodash_1.default.has(obj, "$escape") && lodash_1.default.size(obj) === 1;
        },
        matchObject: function (obj) {
            if (lodash_1.default.isEmpty(obj) || lodash_1.default.size(obj) > 2) {
                return false;
            }
            return lodash_1.default.some(builtinConverters, function (converter) {
                return converter.matchJSONValue(obj);
            });
        },
        toJSONValue: function (obj) {
            var newObj = {};
            lodash_1.default.each(obj, function (value, key) {
                newObj[key] = EJSON.toJSONValue(value);
            });
            return { $escape: newObj };
        },
        fromJSONValue: function (obj) {
            var newObj = {};
            lodash_1.default.each(obj.$escape, function (value, key) {
                newObj[key] = EJSON.fromJSONValue(value);
            });
            return newObj;
        }
    },
    {
        // Custom
        matchJSONValue: function (obj) {
            return lodash_1.default.has(obj, "$type") && lodash_1.default.has(obj, "$value") && lodash_1.default.size(obj) === 2;
        },
        matchObject: function (obj) {
            return EJSON._isCustomType(obj);
        },
        toJSONValue: function (obj) {
            return { $type: obj.typeName(), $value: obj.toJSONValue() };
        },
        fromJSONValue: function (obj) {
            var typeName = obj.$type;
            var converter = customTypes[typeName];
            return converter(obj.$value);
        }
    }
];
EJSON._isCustomType = function (obj) {
    return (obj &&
        typeof obj.toJSONValue === "function" &&
        typeof obj.typeName === "function" &&
        lodash_1.default.has(customTypes, obj.typeName()));
};
//for both arrays and objects, in-place modification.
var adjustTypesToJSONValue = (EJSON._adjustTypesToJSONValue = function (obj) {
    if (obj === null)
        return null;
    var maybeChanged = toJSONValueHelper(obj);
    if (maybeChanged !== undefined)
        return maybeChanged;
    lodash_1.default.each(obj, function (value, key) {
        if (typeof value !== "object" && value !== undefined)
            return; // continue
        var changed = toJSONValueHelper(value);
        if (changed) {
            obj[key] = changed;
            return; // on to the next key
        }
        // if we get here, value is an object but not adjustable
        // at this level.  recurse.
        adjustTypesToJSONValue(value);
    });
    return obj;
});
// Either return the JSON-compatible version of the argument, or undefined (if
// the item isn't itself replaceable, but maybe some fields in it are)
var toJSONValueHelper = function (item) {
    for (var i = 0; i < builtinConverters.length; i++) {
        var converter = builtinConverters[i];
        if (converter.matchObject(item)) {
            return converter.toJSONValue(item);
        }
    }
    return undefined;
};
EJSON.toJSONValue = function (item) {
    var changed = toJSONValueHelper(item);
    if (changed !== undefined)
        return changed;
    if (typeof item === "object") {
        item = EJSON.clone(item);
        adjustTypesToJSONValue(item);
    }
    return item;
};
//for both arrays and objects. Tries its best to just
// use the object you hand it, but may return something
// different if the object you hand it itself needs changing.
var adjustTypesFromJSONValue = (EJSON._adjustTypesFromJSONValue = function (obj) {
    if (obj === null)
        return null;
    var maybeChanged = fromJSONValueHelper(obj);
    if (maybeChanged !== obj)
        return maybeChanged;
    lodash_1.default.each(obj, function (value, key) {
        if (typeof value === "object") {
            var changed = fromJSONValueHelper(value);
            if (value !== changed) {
                obj[key] = changed;
                return;
            }
            // if we get here, value is an object but not adjustable
            // at this level.  recurse.
            adjustTypesFromJSONValue(value);
        }
    });
    return obj;
});
// Either return the argument changed to have the non-json
// rep of itself (the Object version) or the argument itself.
// DOES NOT RECURSE.  For actually getting the fully-changed value, use
// EJSON.fromJSONValue
var fromJSONValueHelper = function (value) {
    if (typeof value === "object" && value !== null) {
        if (lodash_1.default.size(value) <= 2 &&
            lodash_1.default.every(value, function (v, k) {
                return typeof k === "string" && k.substr(0, 1) === "$";
            })) {
            for (var i = 0; i < builtinConverters.length; i++) {
                var converter = builtinConverters[i];
                if (converter.matchJSONValue(value)) {
                    return converter.fromJSONValue(value);
                }
            }
        }
    }
    return value;
};
EJSON.fromJSONValue = function (item) {
    var changed = fromJSONValueHelper(item);
    if (changed === item && typeof item === "object") {
        item = EJSON.clone(item);
        adjustTypesFromJSONValue(item);
        return item;
    }
    else {
        return changed;
    }
};
EJSON.stringify = function (item) {
    return JSON.stringify(EJSON.toJSONValue(item));
};
EJSON.parse = function (item) {
    return EJSON.fromJSONValue(JSON.parse(item));
};
EJSON.isBinary = function (obj) {
    return (typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) || (obj && obj.$Uint8ArrayPolyfill);
};
EJSON.equals = function (a, b, options) {
    var i;
    var keyOrderSensitive = !!(options && options.keyOrderSensitive);
    if (a === b)
        return true;
    if (!a || !b)
        // if either one is falsy, they'd have to be === to be equal
        return false;
    if (!(typeof a === "object" && typeof b === "object"))
        return false;
    if (a instanceof Date && b instanceof Date)
        return a.valueOf() === b.valueOf();
    if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
        if (a.length !== b.length)
            return false;
        for (i = 0; i < a.length; i++) {
            if (a[i] !== b[i])
                return false;
        }
        return true;
    }
    if (typeof a.equals === "function")
        return a.equals(b, options);
    if (a instanceof Array) {
        if (!(b instanceof Array))
            return false;
        if (a.length !== b.length)
            return false;
        for (i = 0; i < a.length; i++) {
            if (!EJSON.equals(a[i], b[i], options))
                return false;
        }
        return true;
    }
    // fall back to structural equality of objects
    var ret;
    if (keyOrderSensitive) {
        var bKeys = [];
        lodash_1.default.each(b, function (val, x) {
            bKeys.push(x);
        });
        i = 0;
        ret = lodash_1.default.every(a, function (val, x) {
            if (i >= bKeys.length) {
                return false;
            }
            if (x !== bKeys[i]) {
                return false;
            }
            if (!EJSON.equals(val, b[bKeys[i]], options)) {
                return false;
            }
            i++;
            return true;
        });
        return ret && i === bKeys.length;
    }
    else {
        i = 0;
        ret = lodash_1.default.every(a, function (val, key) {
            if (!lodash_1.default.has(b, key)) {
                return false;
            }
            if (!EJSON.equals(val, b[key], options)) {
                return false;
            }
            i++;
            return true;
        });
        return ret && lodash_1.default.size(b) === i;
    }
};
EJSON.clone = function (v) {
    var ret;
    if (typeof v !== "object")
        return v;
    if (v === null)
        return null; // null has typeof "object"
    if (v instanceof Date)
        return new Date(v.getTime());
    if (EJSON.isBinary(v)) {
        ret = EJSON.newBinary(v.length);
        for (var i = 0; i < v.length; i++) {
            ret[i] = v[i];
        }
        return ret;
    }
    if (lodash_1.default.isArray(v) || lodash_1.default.isArguments(v)) {
        // For some reason, _.map doesn't work in this context on Opera (weird test
        // failures).
        ret = [];
        for (i = 0; i < v.length; i++)
            ret[i] = EJSON.clone(v[i]);
        return ret;
    }
    // handle general user-defined typed Objects if they have a clone method
    if (typeof v.clone === "function") {
        return v.clone();
    }
    // handle other objects
    ret = {};
    lodash_1.default.each(v, function (value, key) {
        ret[key] = EJSON.clone(value);
    });
    return ret;
};
exports.default = EJSON;
