_ = require 'lodash'
utils = require('./utils')

# Replicates data into a both a master and a replica db. Assumes both are identical at start
# and then only uses master for finds and does all changes to both
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
    # Upsert does to both
    @masterCol.cache(docs, selector, options, () =>
      @replicaCol.cache(docs, selector, options, success, error)
    , error)

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

  uncache: (selector, success, error) ->
    @masterCol.uncache(selector, () =>
      @replicaCol.uncache(selector, success, error)
    , error)

