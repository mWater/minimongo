# Utilities for db handling
_ = require 'lodash'
async = require 'async'
bowser = require 'bowser'

compileDocumentSelector = require('./selector').compileDocumentSelector
compileSort = require('./selector').compileSort

booleanPointInPolygon = require("@turf/boolean-point-in-polygon").default
intersect = require("@turf/intersect").default
booleanCrosses = require("@turf/boolean-crosses").default
booleanWithin = require("@turf/boolean-within").default

# Test window.localStorage
isLocalStorageSupported = ->
  if not window.localStorage
    return false
  try
    window.localStorage.setItem("test", "test")
    window.localStorage.removeItem("test")
    return true
  catch e
    return false

# Compile a document selector (query) to a lambda function
exports.compileDocumentSelector = compileDocumentSelector

# Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
exports.autoselectLocalDb = (options, success, error) ->
  # Here due to browserify circularity quirks
  IndexedDb = require './IndexedDb'
  WebSQLDb = require './WebSQLDb'
  LocalStorageDb = require './LocalStorageDb'
  MemoryDb = require './MemoryDb'

  # Get browser capabilities
  browser = bowser.browser

  # Browsers with no localStorage support don't deserve anything better than a MemoryDb
  if not isLocalStorageSupported()
    return new MemoryDb(options, success)

  # Always use WebSQL in cordova
  if window.cordova
    if window.device?.platform == "iOS" and window.sqlitePlugin
      console.log "Selecting WebSQLDb(sqlite) for Cordova"
      options.storage = 'sqlite'
      return new WebSQLDb options, success, error
    else
      console.log "Selecting else WebSQLDb for Cordova"
      # WebSQLDb must success in Cordova
      return new WebSQLDb options, success, error

  # Use IndexedDb for ios, Safari
  if browser.ios or browser.safari
    # Fallback to IndexedDb
    return new IndexedDb options, success, (err) =>
      console.log "Failed to create IndexedDb: " + (if err then err.message)
      # Create memory db instead
      return new MemoryDb(options, success)

  # Use WebSQL in Android, Chrome,  Opera, Blackberry if supports it
  if browser.android or browser.chrome or browser.opera or browser.blackberry
    if typeof window.openDatabase == "function"
      console.log "Selecting WebSQLDb for browser"
      return new WebSQLDb options, success, (err) =>
        console.log "Failed to create WebSQLDb: " + (if err then err.message)

        # Fallback to IndexedDb
        return new IndexedDb options, success, (err) =>
          console.log "Failed to create IndexedDb: " + (if err then err.message)
          # Create memory db instead
          return new MemoryDb(options, success)
    else 
      # Fallback to IndexedDb
      console.log "Selecting IndexedDb for browser as WebSQL not supported"
      return new IndexedDb options, success, (err) =>
        console.log "Failed to create IndexedDb: " + (if err then err.message)
        # Create memory db instead
        return new MemoryDb(options, success)

  # Use IndexedDb on Firefox >= 16
  if browser.firefox and browser.version >= 16
    console.log "Selecting IndexedDb for browser"
    return new IndexedDb options, success, (err) =>
      console.log "Failed to create IndexedDb: " + (if err then err.message)
      # Create memory db instead
      return new MemoryDb(options, success)

  # Use Local Storage otherwise
  console.log "Selecting LocalStorageDb for fallback"
  return new LocalStorageDb(options, success, error)

# Migrates a local database's pending upserts and removes from one database to another
# Useful for upgrading from one type of database to another
exports.migrateLocalDb = (fromDb, toDb, success, error) ->
  # Migrate collection using a HybridDb
  # Here due to browserify circularity quirks
  HybridDb = require './HybridDb'
  hybridDb = new HybridDb(fromDb, toDb)
  for name, col of fromDb.collections
    if toDb[name]
      hybridDb.addCollection(name)

  hybridDb.upload(success, error)

# Clone a local database's caches, pending upserts and removes from one database to another
# Useful for making a replica
exports.cloneLocalDb = (fromDb, toDb, success, error) ->
  for name, col of fromDb.collections
    # TODO Assumes synchronous addCollection
    if not toDb[name]
      toDb.addCollection(name)

  # First cache all data
  async.each _.values(fromDb.collections), (fromCol, cb) =>
    toCol = toDb[fromCol.name]

    # Get all items
    fromCol.find({}).fetch (items) =>
      # Seed items
      toCol.seed items, =>
        # Copy upserts
        fromCol.pendingUpserts (upserts) =>
          toCol.upsert _.pluck(upserts, "doc"), _.pluck(upserts, "base"), =>
            # Copy removes
            fromCol.pendingRemoves (removes) =>
              async.eachSeries removes, (remove, cb2) =>
                toCol.remove remove, () =>
                  cb2()
                , cb2
              , cb
            , cb
          , cb
        , cb
      , cb
    , cb
  , (err) =>
    if err
      return error(err)

    success()

# Clone a local database collection's caches, pending upserts and removes from one database to another
# Useful for making a replica
exports.cloneLocalCollection = (fromCol, toCol, success, error) ->
  # Get all items
  fromCol.find({}).fetch (items) =>
    # Seed items
    toCol.seed items, =>
      # Copy upserts
      fromCol.pendingUpserts (upserts) =>
        toCol.upsert _.pluck(upserts, "doc"), _.pluck(upserts, "base"), =>
          # Copy removes
          fromCol.pendingRemoves (removes) =>
            async.eachSeries removes, (remove, cb2) =>
              toCol.remove remove, () =>
                cb2()
              , cb2
            , (err) =>
              if err
                return error(err)
              success()
          , error
        , error
      , error
    , error
  , error

# Processes a find with sorting and filtering and limiting
exports.processFind = (items, selector, options) ->
  filtered = _.filter(items, compileDocumentSelector(selector))

  # Handle geospatial operators
  filtered = processNearOperator(selector, filtered)
  filtered = processGeoIntersectsOperator(selector, filtered)

  if options and options.sort
    filtered.sort(compileSort(options.sort))

  if options and options.skip
    filtered = _.slice filtered, options.skip

  if options and options.limit
    filtered = _.take filtered, options.limit

  # Apply fields if present
  if options and options.fields
    filtered = exports.filterFields(filtered, options.fields)

  return filtered

exports.filterFields = (items, fields={}) ->
  # Handle trivial case
  if _.keys(fields).length == 0
    return items

  # For each item
  return _.map items, (item) ->
    newItem = {}

    if _.first(_.values(fields)) == 1
      # Include fields
      for field in _.keys(fields).concat(["_id"])
        path = field.split(".")

        # Determine if path exists
        obj = item
        for pathElem in path
          if obj
            obj = obj[pathElem]

        if not obj?
          continue

        # Go into path, creating as necessary
        from = item
        to = newItem
        for pathElem in _.initial(path)
          to[pathElem] = to[pathElem] or {}

          # Move inside
          to = to[pathElem]
          from = from[pathElem]

        # Copy value
        to[_.last(path)] = from[_.last(path)]

      return newItem
    else
      # Deep clone as we will be deleting keys from item to exclude fields
      item = _.cloneDeep(item)

      # Exclude fields
      for field in _.keys(fields)
        path = field.split(".")

        # Go inside path
        obj = item
        for pathElem in _.initial(path)
          if obj
            obj = obj[pathElem]

        # If not there, don't exclude
        if not obj?
          continue

        delete obj[_.last(path)]

      return item


# Creates a unique identifier string
exports.createUid = ->
  'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) ->
    r = Math.random()*16|0
    v = if c == 'x' then r else (r&0x3|0x8)
    return v.toString(16)
   )

processNearOperator = (selector, list) ->
  for key, value of selector
    if value? and value['$near']
      geo = value['$near']['$geometry']
      if geo.type != 'Point'
        break

      list = _.filter list, (doc) ->
        return doc[key] and doc[key].type == 'Point'

      # Get distances
      distances = _.map list, (doc) ->
        return { doc: doc, distance: getDistanceFromLatLngInM(
            geo.coordinates[1], geo.coordinates[0],
            doc[key].coordinates[1], doc[key].coordinates[0])
        }

      # Filter non-points
      distances = _.filter distances, (item) -> item.distance >= 0

      # Sort by distance
      distances = _.sortBy distances, 'distance'

      # Filter by maxDistance
      if value['$near']['$maxDistance']
        distances = _.filter distances, (item) -> item.distance <= value['$near']['$maxDistance']

      # Extract docs
      list = _.pluck distances, 'doc'
  return list

pointInPolygon = (point, polygon) ->
  return booleanPointInPolygon(point, polygon)

polygonIntersection = (polygon1, polygon2) ->
  return intersect(polygon1, polygon2)?

# From http://www.movable-type.co.uk/scripts/latlong.html
getDistanceFromLatLngInM = (lat1, lng1, lat2, lng2) ->
  R = 6370986 # Radius of the earth in m
  dLat = deg2rad(lat2 - lat1) # deg2rad below
  dLng = deg2rad(lng2 - lng1)
  a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  d = R * c # Distance in m
  return d

deg2rad = (deg) ->
  deg * (Math.PI / 180)

processGeoIntersectsOperator = (selector, list) ->
  for key, value of selector
    if value? and value['$geoIntersects']
      geo = value['$geoIntersects']['$geometry']
      # Can only test intersection with polygon
      if geo.type != 'Polygon'
        break

      # Check within for each
      list = _.filter list, (doc) ->
        # Ignore if null
        if not doc[key]
          return false

        # Check point or polygon
        if doc[key].type == 'Point'
          return pointInPolygon(doc[key], geo)
        else if doc[key].type in ["Polygon", "MultiPolygon"]
          return polygonIntersection(doc[key], geo)
        else if doc[key].type == "LineString"
          return booleanCrosses(doc[key], geo) or booleanWithin(doc[key], geo)
        else if doc[key].type == "MultiLineString"
          # Bypass deficiencies in turf.js by splitting it up
          for line in doc[key].coordinates
            lineGeo = { type: "LineString", coordinates: line }
            if booleanCrosses(lineGeo, geo) or booleanWithin(lineGeo, geo)
              return true
          return false

  return list

# Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> },
# doing basic error checking and making sure that _id is present
# Returns [items, success, error]
exports.regularizeUpsert = (docs, bases, success, error) ->
  # Handle case of bases not present
  if _.isFunction(bases)
    [bases, success, error] = [undefined, bases, success]

  # Handle single upsert
  if not _.isArray(docs)
    docs = [docs]
    bases = [bases]
  else
    bases = bases or []

  # Make into list of { doc: .., base: }
  items = _.map(docs, (doc, i) -> { doc: doc, base: if i < bases.length then bases[i] else undefined})

  # Set _id
  for item in items
    if not item.doc._id
      item.doc._id = exports.createUid()
    if item.base and not item.base._id
      throw new Error("Base needs _id")
    if item.base and item.base._id != item.doc._id
      throw new Error("Base needs same _id")

  return [items, success, error]
