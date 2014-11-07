_ = require 'lodash'
$ = require 'jquery'
utils = require('./utils')

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

  addCollection: (name, success, error) ->
    collection = new Collection(name, @url + name, @client, @httpClient)
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()

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
      if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
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
    if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      params._ = new Date().getTime()

    @httpClient("GET", @url, params, null, success, error)

  # error is called with jqXHR
  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    if not @client
      throw new Error("Client required to upsert")

    if items.length > 1
      throw new Error("Multiple upsert not allowed")

    item = items[0]
    if not item.doc._id
      item.doc._id = utils.createUid()

    params = { client: @client }

    # Add timestamp for Android 2.3.6 bug with caching
    if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      params._ = new Date().getTime()

    # POST if no base, PATCH otherwise
    if item.base
      @httpClient("PATCH", @url + "/" + item.doc._id, params, item, success, error)
    else
      @httpClient("POST", @url, params, item.doc, success, error)

  # error is called with jqXHR
  remove: (id, success, error) ->
    if not @client
      throw new Error("Client required to remove")

    params = { client: @client }
    @httpClient "DELETE", @url + "/" + id, params, null, success, (err) =>
      # 410 is an acceptable delete status
      console.log err
      if err.status == 410
        success()
      else
        error(err)