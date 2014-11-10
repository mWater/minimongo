_ = require 'lodash'
$ = require 'jquery'

createUid = require('./utils').createUid

module.exports = class RemoteDb
  # Url must have trailing /
  constructor: (url, client) ->
    @url = url
    @client = client
    @collections = {}

  addCollection: (name) ->
    collection = new Collection(name, @url + name, @client)
    @[name] = collection
    @collections[name] = collection

  removeCollection: (name) ->
    delete @[name]
    delete @collections[name]

# Remote collection on server
class Collection
  constructor: (name, url, client) ->
    @name = name
    @url = url
    @client = client

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

      req = $.getJSON(@url, params)
      req.done (data, textStatus, jqXHR) =>
        success(data)
      req.fail (jqXHR, textStatus, errorThrown) =>
        if error
          error(jqXHR)

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

    req = $.getJSON(@url, params)
    req.done (data, textStatus, jqXHR) =>
      success(data[0] || null)
    req.fail (jqXHR, textStatus, errorThrown) =>
      if error
        error(jqXHR)

  # error is called with jqXHR
  upsert: (doc, success, error) ->
    if not @client
      throw new Error("Client required to upsert")

    if not doc._id
      doc._id = createUid()

    # Add timestamp for Android 2.3.6 bug with caching
    if navigator.userAgent.toLowerCase().indexOf('android 2.3') != -1
      url = @url + "?client=" + @client + "&_=" + new Date().getTime()
    else
      url = @url + "?client=" + @client

    req = $.ajax(url, {
      data : JSON.stringify(doc),
      contentType : 'application/json',
      type : 'POST'})
    req.done (data, textStatus, jqXHR) =>
      success(data || null)
    req.fail (jqXHR, textStatus, errorThrown) =>
      if error
        error(jqXHR)

  # error is called with jqXHR
  remove: (id, success, error) ->
    if not @client
      throw new Error("Client required to remove")
      
    req = $.ajax(@url + "/" + id + "?client=" + @client, { type : 'DELETE'})
    req.done (data, textStatus, jqXHR) =>
      success()
    req.fail (jqXHR, textStatus, errorThrown) =>
      # 410 means already deleted
      if jqXHR.status == 410
        success()
      else if error
        error(jqXHR)
