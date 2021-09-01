_ = require 'lodash'
createUid = require('./utils').createUid
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

  upsert: (doc, success, error) ->
    # Handle both single and multiple upsert
    items = doc
    if not _.isArray(items)
      items = [items]

    for item in items
      if not item._id
        item._id = createUid()

      # Replace/add
      @items[item._id] = item
      @upserts[item._id] = item

    if success then success(doc)

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

  resolveUpsert: (doc, success) ->
    # Handle both single and multiple upsert
    items = doc
    if not _.isArray(items)
      items = [items]

    for item in items
      if @upserts[item._id]
        # Only safely remove upsert if doc is unchanged
        if _.isEqual(item, @upserts[item._id])
          delete @upserts[item._id]
    if success? then success()

  resolveRemove: (id, success) ->
    delete @removes[id]
    if success? then success()

  # Add but do not overwrite or record as upsert
  seed: (doc, success) ->
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
