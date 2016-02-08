# Create default JSON http client
module.exports = (method, url, params, data, success, error) ->
  # Append
  fullUrl = url + "?" + $.param(params)

  if method == "GET"
    req = $.getJSON(fullUrl)
  else if method == "DELETE"
    req = $.ajax(fullUrl, { type : 'DELETE'})
  else if method == "POST" or method == "PATCH"
    req = $.ajax(fullUrl, {
      data : JSON.stringify(data),
      contentType : 'application/json',
      type : method})
  else
    throw new Error("Unknown method #{method}")

  req.done (response, textStatus, jqXHR) ->
    success(response or null)
  req.fail (jqXHR, textStatus, errorThrown) ->
    if error
      error(jqXHR)
