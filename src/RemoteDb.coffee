_ = require 'lodash'
$ = require 'jquery'
async = require 'async'
utils = require('./utils')
jQueryHttpClient = require './jQueryHttpClient'

module.exports = class RemoteDb
  # Url must have trailing /
  constructor: (url, client, httpClient) ->
    @url = url
    @client = client
    @collections = {}
    @httpClient = httpClient or jQueryHttpClient

  # Can specify url of specific collection as option
  addCollection: (name, options={}, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    url = options.url or (@url + name)

    collection = new Collection(name, url, @client, @httpClient)
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
      if options.skip
        params.skip = options.skip
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
  # Note that findOne is not used by HybridDb, but rather find with limit is used
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

    @httpClient "GET", @url, params, null, (results) ->
      if results and results.length > 0
        success(results[0])
      else
        success(null)
    , error

  # error is called with jqXHR
  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    if not @client
      throw new Error("Client required to upsert")

    results = []

    async.eachLimit items, 8, (item, cb) =>
      if not item.doc._id
        item.doc._id = utils.createUid()

      params = { client: @client }

      # Add timestamp for Android 2.3.6 bug with caching
      if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
        params._ = new Date().getTime()

      # POST if no base, PATCH otherwise
      if item.base
        @httpClient "PATCH", @url + "/" + item.doc._id, params, item, (result) ->
          results.push result
          cb()
        , (err) ->
          cb(err)
      else
        @httpClient "POST", @url, params, item.doc, (result) ->
          results.push result
          cb()
        , (err) ->
          cb(err)
    , (err) ->
      if err
        if error then error(err)
        return

      # Call back differently depending on orig parameters
      if _.isArray(docs)
        if success then success(results)
      else
        if success then success(results[0])

  # error is called with jqXHR
  remove: (id, success, error) ->
    if not @client
      throw new Error("Client required to remove")

    params = { client: @client }
    @httpClient "DELETE", @url + "/" + id, params, null, success, (err) ->
      # 410 is an acceptable delete status
      if err.status == 410
        success()
      else
        error(err)
