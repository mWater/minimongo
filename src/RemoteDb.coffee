_ = require 'lodash'
$ = require 'jquery'
async = require 'async'
utils = require('./utils')
jQueryHttpClient = require './jQueryHttpClient'
quickfind = require './quickfind'
pako = require 'pako'

module.exports = class RemoteDb
  # Url must have trailing /
  # useQuickFind enables the quickfind protocol for finds
  constructor: (url, client, httpClient, useQuickFind = false, compressPayload = false) ->
    @url = url
    @client = client
    @collections = {}
    @httpClient = httpClient
    @useQuickFind = useQuickFind
    @compressPayload = compressPayload

  # Can specify url of specific collection as option
  addCollection: (name, options={}, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    url = options.url or (@url + name)

    collection = new Collection(name, url, @client, @httpClient, @useQuickFind, @compressPayload)
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()

  getCollectionNames: -> _.keys(@collections)

# Remote collection on server
class Collection
  constructor: (name, url, client, httpClient, useQuickFind, compressPayload) ->
    @name = name
    @url = url
    @client = client
    @httpClient = httpClient or jQueryHttpClient
    @useQuickFind = useQuickFind
    @compressPayload = compressPayload

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

      if @compressPayload
        params.selector = pako.deflate(JSON.stringify(selector || {}));

      # Add timestamp for Android 2.3.6 bug with caching
      if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
        params._ = new Date().getTime()

      # If in quickfind and localData present and (no fields option or _rev included) and not (limit with no sort), use quickfind
      if @useQuickFind and options.localData and (not options.fields or options.fields._rev) and not (options.limit and not options.sort)
        @httpClient("POST", @url + "/quickfind", params, quickfind.encodeRequest(options.localData), (encodedResponse) =>
          success(quickfind.decodeResponse(encodedResponse, options.localData, options.sort))
        , error)
      else
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

    # Check if bases present
    basesPresent = _.compact(_.pluck(items, "base")).length > 0

    params = { client: @client }

    # Add timestamp for Android 2.3.6 bug with caching
    if navigator? and navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      params._ = new Date().getTime()

    # Handle single case
    if items.length == 1
      # POST if no base, PATCH otherwise
      if basesPresent
        @httpClient "PATCH", @url, params, items[0], (result) ->
          if _.isArray(docs)
            success([result])
          else
            success(result)
        , (err) ->
          if error then error(err)
      else
        @httpClient "POST", @url, params, items[0].doc, (result) ->
          if _.isArray(docs)
            success([result])
          else
            success(result)
        , (err) ->
          if error then error(err)
    else
      # POST if no base, PATCH otherwise
      if basesPresent
        @httpClient "PATCH", @url, params, { doc: _.pluck(items, "doc"), base: _.pluck(items, "base") }, (result) ->
          success(result)
        , (err) ->
          if error then error(err)
      else
        @httpClient "POST", @url, params, _.pluck(items, "doc"), (result) ->
          success(result)
        , (err) ->
          if error then error(err)


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
