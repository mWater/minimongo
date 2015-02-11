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

  req.done (response, textStatus, jqXHR) ->
    # Add debugging for https://github.com/mWater/minimongo/issues/16
    if not response?
      console.error("Empty response: #{fullUrl}:#{method} returned " + jqXHR.responseText + " as JSON " + JSON.stringify(response))

    success(response or null)
  req.fail (jqXHR, textStatus, errorThrown) ->
    if error
      error(jqXHR)
