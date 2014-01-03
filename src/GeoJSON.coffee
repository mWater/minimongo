# GeoJSON helper routines

# Converts navigator position to point
exports.posToPoint = (pos) ->
  return {
    type: 'Point'
    coordinates: [pos.coords.longitude, pos.coords.latitude]
  }


exports.latLngBoundsToGeoJSON = (bounds) ->
  s = bounds.getSouth()
  w = bounds.getWest()
  n = bounds.getNorth()
  e = bounds.getEast()

  if s < -90 then s = -90
  if n > 90 then n = 90
  if w < -180 then w = -180
  if e > 180 then e = 180

  # Clip values
  return {
    type: 'Polygon',
    coordinates: [
      [[w, s], 
      [w, n], 
      [e, n], 
      [e, s],
      [w, s]]
    ]
  }

# TODO: only works with bounds
exports.pointInPolygon = (point, polygon) ->
  # Check that first == last
  if not _.isEqual(_.first(polygon.coordinates[0]), _.last(polygon.coordinates[0]))
    throw new Error("First must equal last")

  # Get bounds
  bounds = new L.LatLngBounds(_.map(polygon.coordinates[0], (coord) -> new L.LatLng(coord[1], coord[0])))
  return bounds.contains(new L.LatLng(point.coordinates[1], point.coordinates[0]))

exports.getRelativeLocation = (from, to) ->
  x1 = from.coordinates[0]
  y1 = from.coordinates[1]
  x2 = to.coordinates[0]
  y2 = to.coordinates[1]
  
  # Convert to relative position (approximate)
  dy = (y2 - y1) / 57.3 * 6371000
  dx = Math.cos(y1 / 57.3) * (x2 - x1) / 57.3 * 6371000
  
  # Determine direction and angle
  dist = Math.sqrt(dx * dx + dy * dy)
  angle = 90 - (Math.atan2(dy, dx) * 57.3)
  angle += 360 if angle < 0
  angle -= 360 if angle > 360
  
  # Get approximate direction
  compassDir = (Math.floor((angle + 22.5) / 45)) % 8
  compassStrs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  if dist > 1000
    (dist / 1000).toFixed(1) + "km " + compassStrs[compassDir]
  else
    (dist).toFixed(0) + "m " + compassStrs[compassDir]