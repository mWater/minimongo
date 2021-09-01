$ = require 'jquery'
# Create default JSON http client
module.exports = (method, url, params, data, success, error) ->
  # Append
  fullUrl = url + "?" + $.param(params)

  if method == "GET"
    # Use longer timeout for gets
    req = $.ajax(fullUrl, {
      dataType: "json"
      timeout: 180000
    })
  else if method == "DELETE"
    # Add timeout to prevent hung update requests
    req = $.ajax(fullUrl, { type: 'DELETE', timeout: 60000 })
  else if method == "POST" or method == "PATCH"
    req = $.ajax(fullUrl, {
      data: JSON.stringify(data),
      contentType: 'application/json',
      # Add timeout to prevent hung update requests
      timeout: 60000,
      type: method})
  else
    throw new Error("Unknown method #{method}")

  req.done (response, textStatus, jqXHR) ->
    success(response or null)
  req.fail (jqXHR, textStatus, errorThrown) ->
    if error
      error(jqXHR)
