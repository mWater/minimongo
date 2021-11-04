// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
// Utilities for db handling
import _ from "lodash"

import async from "async"
import bowser from "bowser"
import { compileDocumentSelector, compileSort } from "./selector";

// Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
export function autoselectLocalDb(options: any, success: any, error: any) {
  // Here due to browserify circularity quirks
  const IndexedDb = require("./IndexedDb")
  const WebSQLDb = require("./WebSQLDb")
  const LocalStorageDb = require("./LocalStorageDb")
  const MemoryDb = require("./MemoryDb")

  // Get browser capabilities
  const { browser } = bowser

  // Always use WebSQL in cordova
  if (window.cordova) {
    console.log("Selecting WebSQLDb for Cordova")
    return new WebSQLDb(options, success, error)
  }

  // Use WebSQL in Android, iOS, Chrome, Safari, Opera, Blackberry
  if (browser.android || browser.ios || browser.chrome || browser.safari || browser.opera || browser.blackberry) {
    console.log("Selecting WebSQLDb for browser")
    return new WebSQLDb(options, success, error)
  }

  // Use IndexedDb on Firefox >= 16
  if (browser.firefox && browser.version >= 16) {
    console.log("Selecting IndexedDb for browser")
    return new IndexedDb(options, success, error)
  }

  // Use Local Storage otherwise
  console.log("Selecting LocalStorageDb for fallback")
  return new LocalStorageDb(options, success, error)
}

// Migrates a local database's pending upserts and removes from one database to another
// Useful for upgrading from one type of database to another
export function migrateLocalDb(fromDb: any, toDb: any, success: any, error: any) {
  // Migrate collection using a HybridDb
  // Here due to browserify circularity quirks
  const HybridDb = require("./HybridDb")
  const hybridDb = new HybridDb(fromDb, toDb)
  for (let name in fromDb.collections) {
    const col = fromDb.collections[name]
    if (toDb[name]) {
      hybridDb.addCollection(name)
    }
  }

  return hybridDb.upload(success, error)
}

// Processes a find with sorting and filtering and limiting
export function processFind(items: any, selector: any, options: any) {
  let filtered = _.filter(_.values(items), compileDocumentSelector(selector))

  // Handle geospatial operators
  filtered = processNearOperator(selector, filtered)
  filtered = processGeoIntersectsOperator(selector, filtered)

  if (options && options.sort) {
    filtered.sort(compileSort(options.sort))
  }

  if (options && options.limit) {
    filtered = _.first(filtered, options.limit)
  }

  // Clone to prevent accidental updates, or apply fields if present
  if (options && options.fields) {
    // For each item
    filtered = _.map(filtered, function (item: any) {
      let field, obj, path, pathElem
      item = _.cloneDeep(item)

      const newItem = {}

      if (_.first(_.values(options.fields)) === 1) {
        // Include fields
        for (field of _.keys(options.fields).concat(["_id"])) {
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
          to[_.last(path)] = from[_.last(path)]
        }

        return newItem
      } else {
        // Exclude fields
        for (field of _.keys(options.fields).concat(["_id"])) {
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

          delete obj[_.last(path)]
        }

        return item
      }
    })
  } else {
    filtered = _.map(filtered, (doc: any) => _.cloneDeep(doc))
  }

  return filtered
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

      // Limit to 100
      distances = _.first(distances, 100)

      // Extract docs
      list = _.map(distances, "doc")
    }
  }
  return list
}

// Very simple polygon check. Assumes that is a square
function pointInPolygon(point: any, polygon: any) {
  // Check that first == last
  if (!_.isEqual(_.first(polygon.coordinates[0]), _.last(polygon.coordinates[0]))) {
    throw new Error("First must equal last")
  }

  // Check bounds
  if (
    point.coordinates[0] <
    Math.min.apply(
      this,
      _.map(polygon.coordinates[0], (coord: any) => coord[0])
    )
  ) {
    return false
  }
  if (
    point.coordinates[1] <
    Math.min.apply(
      this,
      _.map(polygon.coordinates[0], (coord: any) => coord[1])
    )
  ) {
    return false
  }
  if (
    point.coordinates[0] >
    Math.max.apply(
      this,
      _.map(polygon.coordinates[0], (coord: any) => coord[0])
    )
  ) {
    return false
  }
  if (
    point.coordinates[1] >
    Math.max.apply(
      this,
      _.map(polygon.coordinates[0], (coord: any) => coord[1])
    )
  ) {
    return false
  }
  return true
}

// From http://www.movable-type.co.uk/scripts/latlong.html
function getDistanceFromLatLngInM(lat1: any, lng1: any, lat2: any, lng2: any) {
  const R = 6371000 // Radius of the earth in m
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
      if (geo.type !== "Polygon") {
        break
      }

      // Check within for each
      list = _.filter(list, function (doc: any) {
        // Reject non-points
        if (!doc[key] || doc[key].type !== "Point") {
          return false
        }

        // Check polygon
        return pointInPolygon(doc[key], geo)
      })
    }
  }

  return list
}
