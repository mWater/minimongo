# Utilities for db handling

compileDocumentSelector = require('./selector').compileDocumentSelector
compileSort = require('./selector').compileSort
GeoJSON = require './GeoJSON'


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

      near = new L.LatLng(geo.coordinates[1], geo.coordinates[0])

      list = _.filter list, (doc) ->
        return doc[key] and doc[key].type == 'Point'

      # Get distances
      distances = _.map list, (doc) ->
        return { doc: doc, distance: 
          near.distanceTo(new L.LatLng(doc[key].coordinates[1], doc[key].coordinates[0]))
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
        return GeoJSON.pointInPolygon(doc[key], geo)

  return list
