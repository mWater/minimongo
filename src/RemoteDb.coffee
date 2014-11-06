_ = require 'lodash'
$ = require 'jquery'

# Create default JSON http client
jQueryHttpClient = (method, url, params, data, success, error) ->
  # Append 
  fullUrl = url + "?" + $.params(params)

  if method == "GET"
    req = $.getJSON(fullUrl)
    req.done (response, textStatus, jqXHR) =>
      success(response)
    req.fail (jqXHR, textStatus, errorThrown) =>
      if error
        error(jqXHR)
  else if method == "DELETE"
    req = $.ajax(fullUrl, { type : 'DELETE'})
  else if method == "POST" or method == "PATCH"
    req = $.ajax(fullUrl, {
      data : JSON.stringify(data),
      contentType : 'application/json',
      type : method})
    req.done (response, textStatus, jqXHR) =>
      success(response or null)
    req.fail (jqXHR, textStatus, errorThrown) =>
      if error
        error(jqXHR)

module.exports = class RemoteDb
  # Url must have trailing /
  constructor: (url, client, httpClient) ->
    @url = url
    @client = client
    @collections = {}
    @httpClient = httpClient or jQueryHttpClient

  addCollection: (name) ->
    collection = new Collection(name, @url + name, @client, @httpClient)
    @[name] = collection
    @collections[name] = collection

  removeCollection: (name) ->
    delete @[name]
    delete @collections[name]

# Remote collection on server
class Collection
  constructor: (name, url, client, httpClient) ->
    @name = name
    @url = url
    @client = client
    @httpClient = httpClient

  # error is called with jqXHR
  find: (selector, options = {}) ->
    return fetch: (success, error) =>
      # Create url
      params = {}
      if options.sort
        params.sort = JSON.stringify(options.sort)
      if options.limit
        params.limit = options.limit
      if options.fields
        params.fields = JSON.stringify(options.fields)
      if @client
        params.client = @client
      params.selector = JSON.stringify(selector || {})

      # Add timestamp for Android 2.3.6 bug with caching
      if navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
        params._ = new Date().getTime()

      @httpClient("GET", @url, params, null, success, error)
      
  # error is called with jqXHR
  findOne: (selector, options = {}, success, error) ->
    if _.isFunction(options) 
      [options, success, error] = [{}, options, success]

    # Create url
    params = {}
    if options.sort
      params.sort = JSON.stringify(options.sort)
    params.limit = 1
    if @client
      params.client = @client
    params.selector = JSON.stringify(selector || {})

    # Add timestamp for Android 2.3.6 bug with caching
    if navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      params._ = new Date().getTime()

    @httpClient("GET", @url, params, null, success, error)

  # error is called with jqXHR
  upsert: (doc, base, success, error) ->
    if not @client
      throw new Error("Client required to upsert")

    if not doc._id
      doc._id = createUid()

    params = {}
    if @client
      params.client = @client

    # Add timestamp for Android 2.3.6 bug with caching
    if navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      params._ = new Date().getTime()

    # POST if no base, PATCH otherwise
    if base
      @httpClient("PATCH", @url, params, { doc: doc, base: base }, success, error)
    else
      @httpClient("POST", @url, params, doc, success, error)

  # error is called with jqXHR
  remove: (id, success, error) ->
    if not @client
      throw new Error("Client required to remove")

    params = { client: @client }
    @httpClient("DELETE", @url, params, doc, success, error)