_ = require 'lodash'
async = require 'async'
utils = require('./utils')
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

module.exports = class MemoryDb
  # Options are:
  #  safety: How to protect the in-memory copies: "clone" (default) returns a fresh copy but is slow. "freeze" returns a frozen version
  constructor: (options, success) ->
    @collections = {}
    @options = _.defaults(options, { safety: "clone" })

    if success then success(this)

  addCollection: (name, success, error) ->
    collection = new Collection(name, @options)
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()

  getCollectionNames: -> _.keys(@collections)

# Stores data in memory
class Collection
  constructor: (name, options) ->
    @name = name

    @items = {}
    @upserts = {}  # Pending upserts by _id. Still in items
    @removes = {}  # Pending removes by _id. No longer in items
    @options = options or {}

  find: (selector, options) ->
    return fetch: (success, error) =>
      @_findFetch(selector, options, success, error)

  findOne: (selector, options, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    @find(selector, options).fetch (results) =>
      if success? then success(@_applySafety(if results.length>0 then results[0] else null))
    , error

  _findFetch: (selector, options, success, error) ->
    # Defer to allow other processes to run
    setTimeout () =>
      # Shortcut if _id is specified
      if selector and selector._id and _.isString(selector._id)
        allItems = _.compact([@items[selector._id]])
      else
        allItems = _.values(@items)
      results = processFind(allItems, selector, options)
      if success? then success(@_applySafety(results))
    , 0

  # Applies safety (either freezing or cloning to object or array)
  _applySafety: (items) =>
    if not items
      return items
    if _.isArray(items)
      return _.map(items, @_applySafety)
    if @options.safety == "clone" or not @options.safety
      return JSON.parse(JSON.stringify(items))
    if @options.safety == "freeze"
      Object.freeze(items)
      return items

    throw new Error("Unsupported safety #{@options.safety}")

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    # Keep independent copies to prevent modification
    items = JSON.parse(JSON.stringify(items))

    for item in items
      # Fill in base if undefined
      if item.base == undefined
        # Use existing base
        if @upserts[item.doc._id]
          item.base = @upserts[item.doc._id].base
        else
          item.base = @items[item.doc._id] or null

      # Replace/add
      @items[item.doc._id] = item.doc
      @upserts[item.doc._id] = item

    if _.isArray(docs)
      if success then success(@_applySafety(_.pluck(items, "doc")))
    else
      if success then success(@_applySafety(_.pluck(items, "doc")[0]))

  remove: (id, success, error) ->
    # Special case for filter-type remove
    if _.isObject(id)
      @find(id).fetch (rows) =>
        async.each rows, (row, cb) =>
          @remove(row._id, (=> cb()), cb)
        , => success()
      , error
      return

    if _.has(@items, id)
      @removes[id] = @items[id]
      delete @items[id]
      delete @upserts[id]
    else
      @removes[id] = { _id: id }

    if success? then success()

  # Options are find options with optional "exclude" which is list of _ids to exclude 
  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    for doc in docs
      # Exclude any excluded _ids from being cached/uncached
      if options and options.exclude and doc._id in options.exclude
        continue
      
      @cacheOne(doc)

    docsMap = _.object(_.pluck(docs, "_id"), docs)

    if options.sort
      sort = compileSort(options.sort)

    # Perform query, removing rows missing in docs from local db
    @find(selector, options).fetch (results) =>
      for result in results
        if not docsMap[result._id] and not _.has(@upserts, result._id)
          # If at limit
          if options.limit and docs.length == options.limit
            # If past end on sorted limited, ignore
            if options.sort and sort(result, _.last(docs)) >= 0
              continue
            # If no sort, ignore
            if not options.sort
              continue

          # Exclude any excluded _ids from being cached/uncached
          if options and options.exclude and result._id in options.exclude
            continue

          delete @items[result._id]

      if success? then success()
    , error

  pendingUpserts: (success) ->
    success _.values(@upserts)

  pendingRemoves: (success) ->
    success _.pluck(@removes, "_id")

  resolveUpserts: (upserts, success) ->
    for upsert in upserts
      id = upsert.doc._id
      if @upserts[id]
        # Only safely remove upsert if doc is unchanged
        if _.isEqual(upsert.doc, @upserts[id].doc)
          delete @upserts[id]
        else
          # Just update base
          @upserts[id].base = upsert.doc

    if success? then success()

  resolveRemove: (id, success) ->
    delete @removes[id]
    if success? then success()

  # Add but do not overwrite or record as upsert
  seed: (docs, success) ->
    if not _.isArray(docs)
      docs = [docs]

    for doc in docs
      if not _.has(@items, doc._id) and not _.has(@removes, doc._id)
        @items[doc._id] = doc
    if success? then success()

  # Add but do not overwrite upserts or removes
  cacheOne: (doc, success, error) ->
    @cacheList([doc], success, error)

  # Add but do not overwrite upserts or removes
  cacheList: (docs, success) ->
    for doc in docs
      if not _.has(@upserts, doc._id) and not _.has(@removes, doc._id)
        existing = @items[doc._id]

        # If _rev present, make sure that not overwritten by lower or equal _rev
        if not existing or not doc._rev or not existing._rev or doc._rev > existing._rev
          @items[doc._id] = doc
  
    if success? then success()

  uncache: (selector, success, error) ->
    compiledSelector = utils.compileDocumentSelector(selector)

    items = _.filter(_.values(@items), (item) =>
      return @upserts[item._id]? or not compiledSelector(item)
      )

    @items = _.object(_.pluck(items, "_id"), items)
    if success? then success()

  uncacheList: (ids, success, error) ->
    idIndex = _.indexBy(ids)

    items = _.filter(_.values(@items), (item) =>
      return @upserts[item._id]? or not idIndex[item._id]
      )

    @items = _.object(_.pluck(items, "_id"), items)
    if success? then success()
