# Utilities for db handling
_ = require 'lodash'
async = require 'async'
bowser = require 'bowser'

compileDocumentSelector = require('./selector').compileDocumentSelector
compileSort = require('./selector').compileSort

# Select appropriate local database, prefering IndexedDb, then WebSQLDb, then LocalStorageDb, then MemoryDb
exports.autoselectLocalDb = (options, success, error) ->
  # Here due to browserify circularity quirks
  IndexedDb = require './IndexedDb'
  WebSQLDb = require './WebSQLDb'
  LocalStorageDb = require './LocalStorageDb'
  MemoryDb = require './MemoryDb'

  # Get browser capabilities
  browser = bowser.browser

  # Always use WebSQL in cordova
  if window.cordova
    console.log "Selecting WebSQLDb for Cordova"
    return new WebSQLDb options, success, error

  # Use WebSQL in Android, iOS, Chrome, Safari, Opera, Blackberry
  if browser.android or browser.ios or browser.chrome or browser.safari or browser.opera or browser.blackberry
    console.log "Selecting WebSQLDb for browser"
    return new WebSQLDb options, success, error

  # Use IndexedDb on Firefox >= 16
  if browser.firefox and browser.version >= 16
    console.log "Selecting IndexedDb for browser"
    return new IndexedDb options, success, error

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

# Processes a find with sorting and filtering and limiting
exports.processFind = (items, selector, options) ->
  filtered = _.filter(_.values(items), compileDocumentSelector(selector))

  # Handle geospatial operators
  filtered = processNearOperator(selector, filtered)
  filtered = processGeoIntersectsOperator(selector, filtered)

  if options and options.sort 
    filtered.sort(compileSort(options.sort))

  if options and options.limit
    filtered = _.first filtered, options.limit

  # Clone to prevent accidental updates, or apply fields if present
  if options and options.fields
    if _.first(_.values(options.fields)) == 1
      # Include fields
      filtered = _.map filtered, (doc) -> _.pick(doc, _.keys(options.fields).concat(["_id"]))
    else
      # Exclude fields
      filtered = _.map filtered, (doc) -> _.omit(doc, _.keys(options.fields))
  else
    filtered = _.map filtered, (doc) -> _.cloneDeep(doc)

  return filtered

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

      # Limit to 100
      distances = _.first distances, 100

      # Extract docs
      list = _.pluck distances, 'doc'
  return list

# Very simple polygon check. Assumes that is a square
pointInPolygon = (point, polygon) ->
  # Check that first == last
  if not _.isEqual(_.first(polygon.coordinates[0]), _.last(polygon.coordinates[0]))
    throw new Error("First must equal last")

  # Check bounds
  if point.coordinates[0] < Math.min.apply(this, 
      _.map(polygon.coordinates[0], (coord) -> coord[0]))
    return false
  if point.coordinates[1] < Math.min.apply(this, 
      _.map(polygon.coordinates[0], (coord) -> coord[1]))
    return false
  if point.coordinates[0] > Math.max.apply(this, 
      _.map(polygon.coordinates[0], (coord) -> coord[0]))
    return false
  if point.coordinates[1] > Math.max.apply(this, 
      _.map(polygon.coordinates[0], (coord) -> coord[1]))
    return false
  return true

# From http://www.movable-type.co.uk/scripts/latlong.html
getDistanceFromLatLngInM = (lat1, lng1, lat2, lng2) ->
  R = 6371000 # Radius of the earth in m
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
      if geo.type != 'Polygon'
        break

      # Check within for each
      list = _.filter list, (doc) ->
        # Reject non-points
        if not doc[key] or doc[key].type != 'Point'
          return false

        # Check polygon
        return pointInPolygon(doc[key], geo)

  return list
