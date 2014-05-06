_ = require 'lodash'
createUid = require('./utils').createUid
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

module.exports = class MemoryDb
  constructor: (options) ->
    @collections = {}

  addCollection: (name) ->
    collection = new Collection(name)
    @[name] = collection
    @collections[name] = collection

  removeCollection: (name) ->
    delete @[name]
    delete @collections[name]

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
    if not doc._id
      doc._id = createUid()

    # Replace/add 
    @items[doc._id] = doc
    @upserts[doc._id] = doc

    if success? then success(doc)

  remove: (id, success, error) ->
    if _.has(@items, id)
      @removes[id] = @items[id]
      delete @items[id]
      delete @upserts[id]

    if success? then success()

  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    for doc in docs
      if not _.has(@upserts, doc._id) and not _.has(@removes, doc._id)
        @items[doc._id] = doc

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
    if @upserts[doc._id]
      # Only safely remove upsert if doc received back from 
      # server is the same, excluding certain server-added fields (_rev, created, modified)
      # or server-modified fields (user, org)
      serverFields = ['_rev', 'created', 'modified', 'user', 'org']
      if _.isEqual(_.omit(doc, serverFields), _.omit(@upserts[doc._id], serverFields))
        delete @upserts[doc._id]
    if success? then success()

  resolveRemove: (id, success) ->
    delete @removes[id]
    if success? then success()

  # Add but do not overwrite or record as upsert
  seed: (doc, success) ->
    if not _.has(@items, doc._id) and not _.has(@removes, doc._id)
      @items[doc._id] = doc
    if success? then success()

