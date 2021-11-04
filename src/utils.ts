// Utilities for db handling
import _ from "lodash"

import async from "async"
import bowser from "bowser"
import { compileDocumentSelector, compileSort } from "./selector";
import { default as booleanPointInPolygon } from "@turf/boolean-point-in-polygon"
import { default as intersect } from "@turf/intersect"
import { default as booleanCrosses } from "@turf/boolean-crosses"
import { default as booleanWithin } from "@turf/boolean-within"
import { MinimongoCollection, MinimongoDb, MinimongoLocalCollection } from "./types"

import { default as IndexedDb } from "./IndexedDb"
import { default as WebSQLDb } from "./WebSQLDb"
import { default as LocalStorageDb } from "./LocalStorageDb"
import { default as MemoryDb } from "./MemoryDb"
import { default as HybridDb } from "./HybridDb"

// Test window.localStorage
function isLocalStorageSupported() {
  if (!window.localStorage) {
    return false
  }
  try {
    window.localStorage.setItem("test", "test")
    window.localStorage.removeItem("test")
    return true
  } catch (e) {
    return false
  }
}

// Compile a document selector (query) to a lambda function
export { compileDocumentSelector }

// Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
export function autoselectLocalDb(options: any, success: any, error: any) {
  // Get browser capabilities
  const { browser } = bowser

  // Browsers with no localStorage support don't deserve anything better than a MemoryDb
  if (!isLocalStorageSupported()) {
    return new MemoryDb(options, success)
  }

  // Always use WebSQL in cordova
  if (window["cordova"]) {
    if (window["device"]?.platform === "iOS" && window["sqlitePlugin"]) {
      console.log("Selecting WebSQLDb(sqlite) for Cordova")
      options.storage = "sqlite"
      return new WebSQLDb(options, success, error)
    } else {
      console.log("Selecting else WebSQLDb for Cordova")
      // WebSQLDb must success in Cordova
      return new WebSQLDb(options, success, error)
    }
  }

  // Use IndexedDb for ios, Safari
  if (browser.ios || browser.safari) {
    // Fallback to IndexedDb
    return new IndexedDb(options, success, (err: any) => {
      console.log("Failed to create IndexedDb: " + (err ? err.message : undefined))
      // Create memory db instead
      return new MemoryDb(options, success)
    })
  }

  // Use WebSQL in Android, Chrome,  Opera, Blackberry if supports it
  if (browser.android || browser.chrome || browser.opera || browser.blackberry) {
    if (typeof window["openDatabase"] === "function") {
      console.log("Selecting WebSQLDb for browser")
      return new WebSQLDb(options, success, (err: any) => {
        console.log("Failed to create WebSQLDb: " + (err ? err.message : undefined))

        // Fallback to IndexedDb
        return new IndexedDb(options, success, (err: any) => {
          console.log("Failed to create IndexedDb: " + (err ? err.message : undefined))
          // Create memory db instead
          return new MemoryDb(options, success)
        })
      })
    } else {
      // Fallback to IndexedDb
      console.log("Selecting IndexedDb for browser as WebSQL not supported")
      return new IndexedDb(options, success, (err: any) => {
        console.log("Failed to create IndexedDb: " + (err ? err.message : undefined))
        // Create memory db instead
        return new MemoryDb(options, success)
      })
    }
  }

  // Use IndexedDb on Firefox >= 16
  if (browser.firefox && browser.version >= 16) {
    console.log("Selecting IndexedDb for browser")
    return new IndexedDb(options, success, (err: any) => {
      console.log("Failed to create IndexedDb: " + (err ? err.message : undefined))
      // Create memory db instead
      return new MemoryDb(options, success)
    })
  }

  // Use Local Storage otherwise
  console.log("Selecting LocalStorageDb for fallback")
  return new LocalStorageDb(options, success, error)
}

// Migrates a local database's pending upserts and removes from one database to another
// Useful for upgrading from one type of database to another
export function migrateLocalDb(fromDb: any, toDb: any, success: any, error: any) {
  // Migrate collection using a HybridDb
  const hybridDb = new HybridDb(fromDb, toDb)
  for (let name in fromDb.collections) {
    const col = fromDb.collections[name]
    if (toDb[name]) {
      hybridDb.addCollection(name)
    }
  }

  return hybridDb.upload(success, error)
}


/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export function cloneLocalDb(
  fromDb: MinimongoDb,
  toDb: MinimongoDb,
  success: () => void,
  error: (err: any) => void
): void {
  let name
  for (name in fromDb.collections) {
    // TODO Assumes synchronous addCollection
    const col = fromDb.collections[name]
    if (!toDb[name]) {
      toDb.addCollection(name)
    }
  }

  // First cache all data
  return async.each(
    _.values(fromDb.collections),
    ((fromCol: any, cb: any) => {
      const toCol = toDb[fromCol.name]

      // Get all items
      return fromCol.find({}).fetch((items: any) => {
        // Seed items
        return toCol.seed(
          items,
          () => {
            // Copy upserts
            return fromCol.pendingUpserts((upserts: any) => {
              return toCol.upsert(
                _.map(upserts, "doc"),
                _.map(upserts, "base"),
                () => {
                  // Copy removes
                  return fromCol.pendingRemoves((removes: any) => {
                    return async.eachSeries(
                      removes,
                      ((remove: any, cb2: any) => {
                        return toCol.remove(
                          remove,
                          () => {
                            return cb2()
                          },
                          cb2
                        )
                      }) as any,
                      cb
                    )
                  }, cb)
                },
                cb
              )
            }, cb)
          },
          cb
        )
      }, cb)
    }) as any,
    (err: any) => {
      if (err) {
        return error(err)
      }

      return success()
    }
  )
}

/** Clone a local database collection's caches, pending upserts and removes from one database to another
 * Useful for making a replica */
export function cloneLocalCollection(
  fromCol: MinimongoLocalCollection,
  toCol: MinimongoLocalCollection,
  success: () => void,
  error: (err: any) => void
): void {
  // Get all items
  return fromCol.find({}).fetch((items: any) => {
    // Seed items
    return toCol.seed(
      items,
      () => {
        // Copy upserts
        return fromCol.pendingUpserts((upserts: any) => {
          return toCol.upsert(
            _.map(upserts, "doc"),
            _.map(upserts, "base"),
            () => {
              // Copy removes
              return fromCol.pendingRemoves((removes: any) => {
                const iterator: any = (remove: any, cb2: any) => {
                  return toCol.remove(
                    remove,
                    () => {
                      return cb2()
                    },
                    cb2
                  )
                }

                return async.eachSeries(
                  removes,
                  iterator,
                  (err: any) => {
                    if (err) {
                      return error(err)
                    }
                    return success()
                  }
                )
              }, error)
            },
            error
          )
        }, error)
      },
      error
    )
  }, error)
}

// Processes a find with sorting and filtering and limiting
export function processFind(items: any, selector: any, options: any) {
  let filtered = _.filter(items, compileDocumentSelector(selector))

  // Handle geospatial operators
  filtered = processNearOperator(selector, filtered)
  filtered = processGeoIntersectsOperator(selector, filtered)

  if (options && options.sort) {
    filtered.sort(compileSort(options.sort))
  }

  if (options && options.skip) {
    filtered = _.slice(filtered, options.skip)
  }

  if (options && options.limit) {
    filtered = _.take(filtered, options.limit)
  }

  // Apply fields if present
  if (options && options.fields) {
    filtered = exports.filterFields(filtered, options.fields)
  }

  return filtered
}

/** Include/exclude fields in mongo-style */
export function filterFields(items: any[], fields: any = {}): any[] {
  // Handle trivial case
  if (_.keys(fields).length === 0) {
    return items
  }

  // For each item
  return _.map(items, function (item: any) {
    let field, obj, path, pathElem
    const newItem = {}

    if (_.first(_.values(fields)) === 1) {
      // Include fields
      for (field of _.keys(fields).concat(["_id"])) {
        path = field.split(".")

        // Determine if path exists
        obj = item
        for (pathElem of path) {
          if (obj) {
            obj = obj[pathElem]
          }
        }

        if (obj == null) {
          continue
        }

        // Go into path, creating as necessary
        let from = item
        let to = newItem
        for (pathElem of _.initial(path)) {
          to[pathElem] = to[pathElem] || {}

          // Move inside
          to = to[pathElem]
          from = from[pathElem]
        }

        // Copy value
        to[_.last(path)!] = from[_.last(path)!]
      }

      return newItem
    } else {
      // Deep clone as we will be deleting keys from item to exclude fields
      item = _.cloneDeep(item)

      // Exclude fields
      for (field of _.keys(fields)) {
        path = field.split(".")

        // Go inside path
        obj = item
        for (pathElem of _.initial(path)) {
          if (obj) {
            obj = obj[pathElem]
          }
        }

        // If not there, don't exclude
        if (obj == null) {
          continue
        }

        delete obj[_.last(path)!]
      }

      return item
    }
  })
}

// Creates a unique identifier string
export function createUid() {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function processNearOperator(selector: any, list: any) {
  for (var key in selector) {
    var value = selector[key]
    if (value != null && value["$near"]) {
      var geo = value["$near"]["$geometry"]
      if (geo.type !== "Point") {
        break
      }

      list = _.filter(list, (doc: any) => doc[key] && doc[key].type === "Point")

      // Get distances
      let distances = _.map(list, (doc: any) => ({
        doc,

        distance: getDistanceFromLatLngInM(
          geo.coordinates[1],
          geo.coordinates[0],
          doc[key].coordinates[1],
          doc[key].coordinates[0]
        )
      }))

      // Filter non-points
      distances = _.filter(distances, (item: any) => item.distance >= 0)

      // Sort by distance
      distances = _.sortBy(distances, "distance")

      // Filter by maxDistance
      if (value["$near"]["$maxDistance"]) {
        distances = _.filter(distances, (item: any) => item.distance <= value["$near"]["$maxDistance"])
      }

      // Extract docs
      list = _.map(distances, "doc")
    }
  }
  return list
}

function pointInPolygon(point: any, polygon: any) {
  return booleanPointInPolygon(point, polygon)
}

function polygonIntersection(polygon1: any, polygon2: any) {
  return intersect(polygon1, polygon2) != null
}

// From http://www.movable-type.co.uk/scripts/latlong.html
function getDistanceFromLatLngInM(lat1: any, lng1: any, lat2: any, lng2: any) {
  const R = 6370986 // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1) // deg2rad below
  const dLng = deg2rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c // Distance in m
  return d
}

function deg2rad(deg: any) {
  return deg * (Math.PI / 180)
}

function processGeoIntersectsOperator(selector: any, list: any) {
  for (var key in selector) {
    const value = selector[key]
    if (value != null && value["$geoIntersects"]) {
      var geo = value["$geoIntersects"]["$geometry"]
      // Can only test intersection with polygon
      if (geo.type !== "Polygon") {
        break
      }

      // Check within for each
      list = _.filter(list, function (doc: any) {
        // Ignore if null
        if (!doc[key]) {
          return false
        }

        // Check point or polygon
        if (doc[key].type === "Point") {
          return pointInPolygon(doc[key], geo)
        } else if (["Polygon", "MultiPolygon"].includes(doc[key].type)) {
          return polygonIntersection(doc[key], geo)
        } else if (doc[key].type === "LineString") {
          return booleanCrosses(doc[key], geo) || booleanWithin(doc[key], geo)
        } else if (doc[key].type === "MultiLineString") {
          // Bypass deficiencies in turf.js by splitting it up
          for (let line of doc[key].coordinates) {
            const lineGeo = { type: "LineString", coordinates: line }
            if (booleanCrosses(lineGeo, geo) || booleanWithin(lineGeo, geo)) {
              return true
            }
          }
          return false
        }
      })
    }
  }

  return list
}

/** Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> },
 * doing basic error checking and making sure that _id is present
 * Returns [items, success, error]
 */
export function regularizeUpsert<T>(docs: any, bases: any, success: any, error: any): [{ doc: T, base?: T }[], (docs: T[]) => void, (err: any) => void] {
  // Handle case of bases not present
  if (_.isFunction(bases)) {
    ;[bases, success, error] = [undefined, bases, success]
  }

  // Handle single upsert
  if (!_.isArray(docs)) {
    docs = [docs]
    bases = [bases]
  } else {
    bases = bases || []
  }

  // Make into list of { doc: .., base: }
  const items = _.map(docs, (doc, i) => ({
    doc,
    base: i < bases.length ? bases[i] : undefined
  }))

  // Set _id
  for (let item of items) {
    if (!item.doc._id) {
      item.doc._id = exports.createUid()
    }
    if (item.base && !item.base._id) {
      throw new Error("Base needs _id")
    }
    if (item.base && item.base._id !== item.doc._id) {
      throw new Error("Base needs same _id")
    }
  }

  return [items, success, error]
}
