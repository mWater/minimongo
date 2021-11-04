import _ from "lodash"

var EJSON: any = {}
var customTypes = {}
// Add a custom type, using a method of your choice to get to and
// from a basic JSON-able representation.  The factory argument
// is a function of JSON-able --> your object
// The type you add must have:
// - A clone() method, so that Meteor can deep-copy it when necessary.
// - A equals() method, so that Meteor can compare it
// - A toJSONValue() method, so that Meteor can serialize it
// - a typeName() method, to show how to look it up in our type table.
// It is okay if these methods are monkey-patched on.
EJSON.addType = function (name: any, factory: any) {
  if (_.has(customTypes, name)) throw new Error("Type " + name + " already present")
  customTypes[name] = factory
}

var builtinConverters: any = [
  {
    // Date
    matchJSONValue: function (obj: any) {
      return _.has(obj, "$date") && _.size(obj) === 1
    },
    matchObject: function (obj: any) {
      return obj instanceof Date
    },
    toJSONValue: function (obj: any) {
      return { $date: obj.getTime() }
    },
    fromJSONValue: function (obj: any) {
      return new Date(obj.$date)
    }
  },
  {
    // Binary
    matchJSONValue: function (obj: any) {
      return _.has(obj, "$binary") && _.size(obj) === 1
    },
    matchObject: function (obj: any) {
      return (
        (typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) || (obj && _.has(obj, "$Uint8ArrayPolyfill"))
      )
    },
    toJSONValue: function (obj: any) {
      return { $binary: EJSON._base64Encode(obj) }
    },
    fromJSONValue: function (obj: any) {
      return EJSON._base64Decode(obj.$binary)
    }
  },
  {
    // Escaping one level
    matchJSONValue: function (obj: any) {
      return _.has(obj, "$escape") && _.size(obj) === 1
    },
    matchObject: function (obj: any) {
      if (_.isEmpty(obj) || _.size(obj) > 2) {
        return false
      }
      return _.some(builtinConverters, function (converter: any) {
        return converter.matchJSONValue(obj)
      })
    },
    toJSONValue: function (obj: any) {
      var newObj = {}
      _.each(obj, function (value: any, key: any) {
        newObj[key] = EJSON.toJSONValue(value)
      })
      return { $escape: newObj }
    },
    fromJSONValue: function (obj: any) {
      var newObj = {}
      _.each(obj.$escape, function (value: any, key: any) {
        newObj[key] = EJSON.fromJSONValue(value)
      })
      return newObj
    }
  },
  {
    // Custom
    matchJSONValue: function (obj: any) {
      return _.has(obj, "$type") && _.has(obj, "$value") && _.size(obj) === 2
    },
    matchObject: function (obj: any) {
      return EJSON._isCustomType(obj)
    },
    toJSONValue: function (obj: any) {
      return { $type: obj.typeName(), $value: obj.toJSONValue() }
    },
    fromJSONValue: function (obj: any) {
      var typeName = obj.$type
      var converter = customTypes[typeName]
      return converter(obj.$value)
    }
  }
]

EJSON._isCustomType = function (obj: any) {
  return (
    obj &&
    typeof obj.toJSONValue === "function" &&
    typeof obj.typeName === "function" &&
    _.has(customTypes, obj.typeName())
  )
}

//for both arrays and objects, in-place modification.
var adjustTypesToJSONValue = (EJSON._adjustTypesToJSONValue = function (obj: any) {
  if (obj === null) return null
  var maybeChanged = toJSONValueHelper(obj)
  if (maybeChanged !== undefined) return maybeChanged
  _.each(obj, function (value: any, key: any) {
    if (typeof value !== "object" && value !== undefined) return // continue
    var changed = toJSONValueHelper(value)
    if (changed) {
      obj[key] = changed
      return // on to the next key
    }
    // if we get here, value is an object but not adjustable
    // at this level.  recurse.
    adjustTypesToJSONValue(value)
  })
  return obj
})

// Either return the JSON-compatible version of the argument, or undefined (if
// the item isn't itself replaceable, but maybe some fields in it are)
var toJSONValueHelper = function (item: any) {
  for (var i = 0; i < builtinConverters.length; i++) {
    var converter = builtinConverters[i]
    if (converter.matchObject(item)) {
      return converter.toJSONValue(item)
    }
  }
  return undefined
}

EJSON.toJSONValue = function (item: any) {
  var changed = toJSONValueHelper(item)
  if (changed !== undefined) return changed
  if (typeof item === "object") {
    item = EJSON.clone(item)
    adjustTypesToJSONValue(item)
  }
  return item
}

//for both arrays and objects. Tries its best to just
// use the object you hand it, but may return something
// different if the object you hand it itself needs changing.
var adjustTypesFromJSONValue = (EJSON._adjustTypesFromJSONValue = function (obj: any) {
  if (obj === null) return null
  var maybeChanged = fromJSONValueHelper(obj)
  if (maybeChanged !== obj) return maybeChanged
  _.each(obj, function (value: any, key: any) {
    if (typeof value === "object") {
      var changed = fromJSONValueHelper(value)
      if (value !== changed) {
        obj[key] = changed
        return
      }
      // if we get here, value is an object but not adjustable
      // at this level.  recurse.
      adjustTypesFromJSONValue(value)
    }
  })
  return obj
})

// Either return the argument changed to have the non-json
// rep of itself (the Object version) or the argument itself.

// DOES NOT RECURSE.  For actually getting the fully-changed value, use
// EJSON.fromJSONValue
var fromJSONValueHelper = function (value: any) {
  if (typeof value === "object" && value !== null) {
    if (
      _.size(value) <= 2 &&
      _.every(value, function (v: any, k: any) {
        return typeof k === "string" && k.substr(0, 1) === "$"
      })
    ) {
      for (var i = 0; i < builtinConverters.length; i++) {
        var converter = builtinConverters[i]
        if (converter.matchJSONValue(value)) {
          return converter.fromJSONValue(value)
        }
      }
    }
  }
  return value
}

EJSON.fromJSONValue = function (item: any) {
  var changed = fromJSONValueHelper(item)
  if (changed === item && typeof item === "object") {
    item = EJSON.clone(item)
    adjustTypesFromJSONValue(item)
    return item
  } else {
    return changed
  }
}

EJSON.stringify = function (item: any) {
  return JSON.stringify(EJSON.toJSONValue(item))
}

EJSON.parse = function (item: any) {
  return EJSON.fromJSONValue(JSON.parse(item))
}

EJSON.isBinary = function (obj: any) {
  return (typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) || (obj && obj.$Uint8ArrayPolyfill)
}

EJSON.equals = function (a: any, b: any, options: any) {
  var i: any
  var keyOrderSensitive = !!(options && options.keyOrderSensitive)
  if (a === b) return true
  if (!a || !b)
    // if either one is falsy, they'd have to be === to be equal
    return false
  if (!(typeof a === "object" && typeof b === "object")) return false
  if (a instanceof Date && b instanceof Date) return a.valueOf() === b.valueOf()
  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
    if (a.length !== b.length) return false
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  if (typeof a.equals === "function") return a.equals(b, options)
  if (a instanceof Array) {
    if (!(b instanceof Array)) return false
    if (a.length !== b.length) return false
    for (i = 0; i < a.length; i++) {
      if (!EJSON.equals(a[i], b[i], options)) return false
    }
    return true
  }
  // fall back to structural equality of objects
  var ret
  if (keyOrderSensitive) {
    var bKeys: any = []
    _.each(b, function (val: any, x: any) {
      bKeys.push(x)
    })
    i = 0
    ret = _.every(a, function (val: any, x: any) {
      if (i >= bKeys.length) {
        return false
      }
      if (x !== bKeys[i]) {
        return false
      }
      if (!EJSON.equals(val, b[bKeys[i]], options)) {
        return false
      }
      i++
      return true
    })
    return ret && i === bKeys.length
  } else {
    i = 0
    ret = _.every(a, function (val: any, key: any) {
      if (!_.has(b, key)) {
        return false
      }
      if (!EJSON.equals(val, b[key], options)) {
        return false
      }
      i++
      return true
    })
    return ret && _.size(b) === i
  }
}

EJSON.clone = function (v: any) {
  var ret
  if (typeof v !== "object") return v
  if (v === null) return null // null has typeof "object"
  if (v instanceof Date) return new Date(v.getTime())
  if (EJSON.isBinary(v)) {
    ret = EJSON.newBinary(v.length)
    for (var i = 0; i < v.length; i++) {
      ret[i] = v[i]
    }
    return ret
  }
  if (_.isArray(v) || _.isArguments(v)) {
    // For some reason, _.map doesn't work in this context on Opera (weird test
    // failures).
    ret = []
    for (i = 0; i < v.length; i++) ret[i] = EJSON.clone(v[i])
    return ret
  }
  // handle general user-defined typed Objects if they have a clone method
  if (typeof v.clone === "function") {
    return v.clone()
  }
  // handle other objects
  ret = {}
  _.each(v, function (value: any, key: any) {
    ret[key] = EJSON.clone(value)
  })
  return ret
}

export default EJSON
