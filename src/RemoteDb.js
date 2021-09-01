_ = require 'lodash'
$ = require 'jquery'
async = require 'async'
utils = require('./utils')
jQueryHttpClient = require './jQueryHttpClient'
quickfind = require './quickfind'

module.exports = class RemoteDb
  # Url must have trailing /, can be an arrau of URLs
  # useQuickFind enables the quickfind protocol for finds
  # usePostFind enables POST for find
  constructor: (url, client, httpClient, useQuickFind = false, usePostFind = false) ->
    @url = url
    @client = client
    @collections = {}
    @httpClient = httpClient
    @useQuickFind = useQuickFind
    @usePostFind = usePostFind

  # Can specify url of specific collection as option.
  # useQuickFind can be overridden in options
  # usePostFind can be overridden in options
  addCollection: (name, options={}, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    if options.url
      url = options.url
    else
      if _.isArray(@url)
        url = _.map(@url, (url) -> url + name)
      else
        url = @url + name
    
    useQuickFind = @useQuickFind
    if options.useQuickFind?
      useQuickFind = options.useQuickFind

    usePostFind = @usePostFind
    if options.usePostFind?
      usePostFind = options.usePostFind

    collection = new Collection(name, url, @client, @httpClient, useQuickFind, usePostFind)
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
  # usePostFind allows POST to <collection>/find for long selectors
  constructor: (name, url, client, httpClient, useQuickFind, usePostFind) ->
    @name = name
    @url = url
    @client = client
    @httpClient = httpClient or jQueryHttpClient
    @useQuickFind = useQuickFind
    @usePostFind = usePostFind

  getUrl: ->
    if _.isArray(@url)
      url = @url.pop()
      # Add the URL to the front of the array
      @url.unshift(url)
      return url
    return @url

  # error is called with jqXHR
  find: (selector, options = {}) ->
    return fetch: (success, error) =>
      # Determine method: "get", "post" or "quickfind"
      # If in quickfind and localData present and (no fields option or _rev included) and not (limit with no sort), use quickfind
      if @useQuickFind and options.localData and (not options.fields or options.fields._rev) and not (options.limit and not options.sort and not options.orderByExprs)
        method = "quickfind"
      # If selector or fields or sort is too big, use post
      else if @usePostFind and JSON.stringify({ selector: selector, sort: options.sort, fields: options.fields }).length > 500
        method = "post"
      else
        method = "get"

      if method == "get"
        # Create url
        params = {}
        params.selector = JSON.stringify(selector || {})
        if options.sort
          params.sort = JSON.stringify(options.sort)
        if options.limit
          params.limit = options.limit
        if options.skip
          params.skip = options.skip
        if options.fields
          params.fields = JSON.stringify(options.fields)

        # Advanced options for mwater-expression-based filtering and ordering
        if options.whereExpr
          params.whereExpr = JSON.stringify(options.whereExpr)
        if options.orderByExprs
          params.orderByExprs = JSON.stringify(options.orderByExprs)

        if @client
          params.client = @client
        @httpClient("GET", @getUrl(), params, null, success, error)
        return

      # Create body + params for quickfind and post
      body = {
        selector: selector or {}
      }
      if options.sort
        body.sort = options.sort
      if options.limit?
        body.limit = options.limit
      if options.skip?
        body.skip = options.skip
      if options.fields
        body.fields = options.fields
        
      # Advanced options for mwater-expression-based filtering and ordering
      if options.whereExpr
        body.whereExpr = options.whereExpr
      if options.orderByExprs
        body.orderByExprs = options.orderByExprs

      params = {}
      if @client
        params.client = @client

      if method == "quickfind"
        # Send quickfind data
        body.quickfind = quickfind.encodeRequest(options.localData)

        @httpClient("POST", @getUrl() + "/quickfind", params, body, (encodedResponse) =>
          success(quickfind.decodeResponse(encodedResponse, options.localData, options.sort))
        , error)
        return

      # POST method
      @httpClient("POST", @getUrl() + "/find", params, body, (response) =>
        success(response)
      , error)

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

    @httpClient "GET", @getUrl(), params, null, (results) ->
      if results and results.length > 0
        success(results[0])
      else
        success(null)
    , error

  # error is called with jqXHR
  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    results = []

    # Check if bases present
    basesPresent = _.compact(_.pluck(items, "base")).length > 0

    params = { }
    if @client
      params.client = @client

    # Handle single case
    if items.length == 1
      # POST if no base, PATCH otherwise
      if basesPresent
        @httpClient "PATCH", @getUrl(), params, items[0], (result) ->
          if _.isArray(docs)
            success([result])
          else
            success(result)
        , (err) ->
          if error then error(err)
      else
        @httpClient "POST", @getUrl(), params, items[0].doc, (result) ->
          if _.isArray(docs)
            success([result])
          else
            success(result)
        , (err) ->
          if error then error(err)
    else
      # POST if no base, PATCH otherwise
      if basesPresent
        @httpClient "PATCH", @getUrl(), params, { doc: _.pluck(items, "doc"), base: _.pluck(items, "base") }, (result) ->
          success(result)
        , (err) ->
          if error then error(err)
      else
        @httpClient "POST", @getUrl(), params, _.pluck(items, "doc"), (result) ->
          success(result)
        , (err) ->
          if error then error(err)


  # error is called with jqXHR
  remove: (id, success, error) ->
    if not @client
      throw new Error("Client required to remove")

    params = { client: @client }
    @httpClient "DELETE", @getUrl() + "/" + id, params, null, success, (err) ->
      # 410 is an acceptable delete status
      if err.status == 410
        success()
      else
        error(err)
