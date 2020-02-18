_ = require 'lodash'
utils = require('./utils')
compileSort = require('./selector').compileSort

# Replicates data into a both a master and a replica db. Assumes both are identical at start
# and then only uses master for finds and does all changes to both
# Warning: removing a collection removes it from the underlying master and replica!
module.exports = class ReplicatingDb
  constructor: (masterDb, replicaDb) ->
    @collections = {}

    @masterDb = masterDb
    @replicaDb = replicaDb

  addCollection: (name, success, error) ->
    collection = new Collection(name, @masterDb[name], @replicaDb[name])
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()

  getCollectionNames: -> _.keys(@collections)

# Replicated collection.
class Collection
  constructor: (name, masterCol, replicaCol) ->
    @name = name
    @masterCol = masterCol
    @replicaCol = replicaCol

  find: (selector, options) ->
    return @masterCol.find(selector, options)

  findOne: (selector, options, success, error) ->
    return @masterCol.findOne(selector, options, success, error)

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    # Upsert does to both
    @masterCol.upsert(_.pluck(items, "doc"), _.pluck(items, "base"), () =>
      @replicaCol.upsert(_.pluck(items, "doc"), _.pluck(items, "base"), (results) =>
        success(docs)
      , error)
    , error)

  remove: (id, success, error) ->
    # Do to both
    @masterCol.remove(id, () =>
      @replicaCol.remove(id, success, error)
    , error)

  cache: (docs, selector, options, success, error) ->
    # Calculate what has to be done for cache using the master database which is faster (usually MemoryDb)
    # then do minimum to both databases

    # Index docs
    docsMap = _.indexBy(docs, "_id")

    # Compile sort
    if options.sort
      sort = compileSort(options.sort)

    # Perform query
    @masterCol.find(selector, options).fetch (results) =>
      resultsMap = _.indexBy(results, "_id")

      # Determine if each result needs to be cached
      toCache = []
      for doc in docs
        result = resultsMap[doc._id]

        # Exclude any excluded _ids from being cached/uncached
        if options and options.exclude and doc._id in options.exclude
          continue

        # If not present locally, cache it
        if not result
          toCache.push(doc)
          continue

        # If both have revisions (_rev) and new one is same or lower, do not cache
        if doc._rev and result._rev and doc._rev <= result._rev
          continue

        # Only cache if different
        if not _.isEqual(doc, result)
          toCache.push(doc)

      toUncache = []
      for result in results
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

        # Determine which ones to uncache
        if not docsMap[result._id] 
          toUncache.push(result._id)

      # Cache ones needing caching
      performCaches = (next) =>
        if toCache.length > 0
          @masterCol.cacheList(toCache, () =>
            @replicaCol.cacheList(toCache, () =>
              next()
            , error)
          , error)
        else
          next()

      # Uncache list
      performUncaches = (next) =>
        if toUncache.length > 0
          @masterCol.uncacheList(toUncache, () =>
            @replicaCol.uncacheList(toUncache, () =>
              next()
            , error)
          , error)
        else
          next()

      performCaches(=>
        performUncaches(=>
          if success? then success()
          return
        )
      )
    , error

  pendingUpserts: (success, error) ->
    @masterCol.pendingUpserts(success, error)

  pendingRemoves: (success, error) ->
    @masterCol.pendingRemoves(success, error)

  resolveUpserts: (upserts, success, error) ->
    @masterCol.resolveUpserts(upserts, () =>
      @replicaCol.resolveUpserts(upserts, success, error)
    , error)

  resolveRemove: (id, success, error) ->
    @masterCol.resolveRemove(id, () =>
      @replicaCol.resolveRemove(id, success, error)
    , error)

  # Add but do not overwrite or record as upsert
  seed: (docs, success, error) ->
    @masterCol.seed(docs, () =>
      @replicaCol.seed(docs, success, error)
    , error)

  # Add but do not overwrite upserts or removes
  cacheOne: (doc, success, error) ->
    @masterCol.cacheOne(doc, () =>
      @replicaCol.cacheOne(doc, success, error)
    , error)

  # Add but do not overwrite upserts or removes
  cacheList: (docs, success, error) ->
    @masterCol.cacheList(docs, () =>
      @replicaCol.cacheList(docs, success, error)
    , error)

  uncache: (selector, success, error) ->
    @masterCol.uncache(selector, () =>
      @replicaCol.uncache(selector, success, error)
    , error)

  uncacheList: (ids, success, error) ->
    @masterCol.uncacheList(ids, () =>
      @replicaCol.uncacheList(ids, success, error)
    , error)
