_ = require 'lodash'
utils = require('./utils')
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

module.exports = class MemoryDb
  constructor: (options, success) ->
    @collections = {}

    if success then success(this)

  addCollection: (name, success, error) ->
    collection = new Collection(name)
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()

# Stores data in memory
class Collection
  constructor: (name) ->
    @name = name

    @items = {}
    @upserts = {}  # Pending upserts by _id. Still in items
    @removes = {}  # Pending removes by _id. No longer in items

  find: (selector, options) ->
    return fetch: (success, error) =>
      @_findFetch(selector, options, success, error)

  findOne: (selector, options, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    @find(selector, options).fetch (results) ->
      if success? then success(if results.length>0 then results[0] else null)
    , error

  _findFetch: (selector, options, success, error) ->
    if success? then success(processFind(@items, selector, options))

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    for item in items
      # Fill in base if undefined
      if item.base == undefined
        # Use existing base
        if @upserts[item.doc._id]
          item.base = @upserts[item.doc._id].base
        else
          item.base = @items[item.doc._id] or null

      # Keep independent copies
      item = _.cloneDeep(item)

      # Replace/add
      @items[item.doc._id] = item.doc
      @upserts[item.doc._id] = item

    if success then success(docs)

  remove: (id, success, error) ->
    if _.has(@items, id)
      @removes[id] = @items[id]
      delete @items[id]
      delete @upserts[id]
    else
      @removes[id] = { _id: id }

    if success? then success()

  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    for doc in docs
      @cacheOne(doc)

    docsMap = _.object(_.pluck(docs, "_id"), docs)

    if options.sort
      sort = compileSort(options.sort)

    # Perform query, removing rows missing in docs from local db
    @find(selector, options).fetch (results) =>
      for result in results
        if not docsMap[result._id] and not _.has(@upserts, result._id)
          # If past end on sorted limited, ignore
          if options.sort and options.limit and docs.length == options.limit
            if sort(result, _.last(docs)) >= 0
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
  cacheOne: (doc, success) ->
    if not _.has(@upserts, doc._id) and not _.has(@removes, doc._id)
      existing = @items[doc._id]

      # If _rev present, make sure that not overwritten by lower _rev
      if not existing or not doc._rev or not existing._rev or doc._rev >= existing._rev
        @items[doc._id] = doc
    if success? then success()
