_ = require 'lodash'
async = require 'async'
IDBStore = require 'idb-wrapper'
utils = require('./utils')

processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

# Create a database backed by IndexedDb. options must contain namespace: <string to uniquely identify database>
module.exports = class IndexedDb
  constructor: (options, success, error) ->
    @collections = {}

    # Create database
    try
      @store = new IDBStore {
        dbVersion: 1
        storeName: 'minimongo_' + options.namespace
        keyPath: ['col', 'doc._id']
        autoIncrement: false
        onStoreReady: => if success then success(this)
        onError: error
        indexes: [
          { name: 'col', keyPath: 'col', unique: false, multiEntry: false }
          { name: 'col-state', keyPath: ['col', 'state'], unique: false, multiEntry: false}
        ]
      }
    catch ex
      if error
        error(ex)
      return

  addCollection: (name, success, error) ->
    collection = new Collection(name, @store)
    @[name] = collection
    @collections[name] = collection
    if success
      success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]

    # Remove all documents
    @store.query (matches) =>
      keys = _.map matches, (m) -> [ m.col, m.doc._id ]
      if keys.length > 0
        @store.removeBatch keys, ->
          if success? then success()
        , error
      else
        if success? then success()
    , { index: "col", keyRange: @store.makeKeyRange(only: name), onError: error }

  getCollectionNames: -> _.keys(@collections)

# Stores data in indexeddb store
class Collection
  constructor: (name, store) ->
    @name = name
    @store = store

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
    # Get all docs from collection
    @store.query (matches) ->
      # Filter removed docs
      matches = _.filter matches, (m) -> m.state != "removed"
      if success? then success(processFind(_.pluck(matches, "doc"), selector, options))
    , { index: "col", keyRange: @store.makeKeyRange(only: @name), onError: error }

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    # Get bases
    keys = _.map items, (item) => [@name, item.doc._id]
    @store.getBatch keys, (records) =>
      puts = _.map items, (item, i) =>
        # Prefer explicit base
        if item.base != undefined
          base = item.base
        else if records[i] and records[i].doc and records[i].state == "cached"
          base = records[i].doc
        else if records[i] and records[i].doc and records[i].state == "upserted"
          base = records[i].base
        else
          base = null

        return {
          col: @name
          state: "upserted"
          doc: item.doc
          base: base
        }

      @store.putBatch puts, ->
        if success then success(docs)
      , error
    , error

  remove: (id, success, error) ->
    # Special case for filter-type remove
    if _.isObject(id)
      @find(id).fetch (rows) =>
        async.each rows, (row, cb) =>
          @remove(row._id, (=> cb()), cb)
        , => success()
      , error
      return

    # Find record
    @store.get [@name, id], (record) =>
      # If not found, create placeholder record
      if not record?
        record = {
          col: @name
          doc: { _id: id }
        }

      # Set removed
      record.state = "removed"

      # Update
      @store.put record, ->
        if success then success(id)
      , error

  cache: (docs, selector, options, success, error) ->
    step2 = =>
      # Rows have been cached, now look for stale ones to remove
      docsMap = _.object(_.pluck(docs, "_id"), docs)

      if options.sort
        sort = compileSort(options.sort)

      # Perform query, removing rows missing in docs from local db
      @find(selector, options).fetch (results) =>
        removes = []
        keys = _.map results, (result) => [@name, result._id]
        if keys.length == 0
          if success? then success()
          return
        @store.getBatch keys, (records) =>
          for i in [0...records.length]
            record = records[i]
            result = results[i]

            # If not present in docs and is present locally and not upserted/deleted
            if not docsMap[result._id] and record and record.state == "cached"
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

              # Item is gone from server, remove locally
              removes.push [@name, result._id]

          # If removes, handle them
          if removes.length > 0
            @store.removeBatch removes, ->
              if success? then success()
            , error
          else
            if success? then success()
        , error
      , error

    if docs.length == 0
      return step2()

    # Create keys to get items
    keys = _.map docs, (doc) => [@name, doc._id]

    # Create batch of puts
    puts = []
    @store.getBatch keys, (records) =>
      # Add all non-local that are not upserted or removed
      for i in [0...records.length]
        record = records[i]
        doc = docs[i]

        # Check if not present or not upserted/deleted
        if not record? or record.state == "cached"
          if options and options.exclude and doc._id in options.exclude
            continue

          # If _rev present, make sure that not overwritten by lower or equal _rev
          if not record or not doc._rev or not record.doc._rev or doc._rev > record.doc._rev
            puts.push { col: @name, state: "cached", doc: doc }

      # Put batch
      if puts.length > 0
        @store.putBatch puts, step2, error
      else
        step2()
    , error

  pendingUpserts: (success, error) ->
    @store.query (matches) ->
      upserts = _.map matches, (m) -> { doc: m.doc, base: m.base or null }
      if success? then success(upserts)
    , { index: "col-state", keyRange: @store.makeKeyRange(only: [@name, "upserted"]), onError: error }

  pendingRemoves: (success, error) ->
    @store.query (matches) ->
      if success? then success(_.pluck(_.pluck(matches, "doc"), "_id"))
    , { index: "col-state", keyRange: @store.makeKeyRange(only: [@name, "removed"]), onError: error }

  resolveUpserts: (upserts, success, error) ->
    # Get items
    keys = _.map upserts, (upsert) => [@name, upsert.doc._id]
    @store.getBatch keys, (records) =>
      puts = []
      for i in [0...upserts.length]
        record = records[i]

        # Only safely remove upsert if doc is the same
        if record and record.state == "upserted"
          if _.isEqual(record.doc, upserts[i].doc)
            record.state = "cached"
            puts.push(record)
          else
            record.base = upserts[i].doc
            puts.push(record)

      # Put all changed items
      if puts.length > 0
        @store.putBatch puts, ->
          if success then success()
        , error
      else
        if success then success()
    , error

  resolveRemove: (id, success, error) ->
    @store.get [@name, id], (record) =>
      # Check if exists
      if not record
        if success? then success()
        return

      # Only remove if removed
      if record.state == "removed"
        @store.remove [@name, id], ->
          if success? then success()
        , error

  # Add but do not overwrite or record as upsert
  seed: (docs, success, error) ->
    if not _.isArray(docs)
      docs = [docs]

    # Create keys to get items
    keys = _.map docs, (doc) => [@name, doc._id]

    # Create batch of puts
    puts = []
    @store.getBatch keys, (records) =>
      # Add all non-local that are not upserted or removed
      for i in [0...records.length]
        record = records[i]
        doc = docs[i]

        # Check if not present 
        if not record? 
          puts.push { col: @name, state: "cached", doc: doc }

      # Put batch
      if puts.length > 0
        @store.putBatch puts, =>
          if success? then success()            
        , error
      else
        if success? then success()
    , error

  # Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne: (doc, success, error) ->
    @cacheList([doc], success, error)

  cacheList: (docs, success, error) ->
    # Create keys to get items
    keys = _.map docs, (doc) => [@name, doc._id]

    # Create batch of puts
    puts = []
    @store.getBatch keys, (records) =>
      for i in [0...records.length]
        record = records[i]
        doc = docs[i]

        # If _rev present, make sure that not overwritten by lower equal _rev
        if record and doc._rev and record.doc._rev and doc._rev <= record.doc._rev
          continue

        if not record?
          record = {
            col: @name
            state: "cached"
            doc: doc
          }
        if record.state == "cached"
          record.doc = doc
          puts.push(record)

      # Put batch
      if puts.length > 0
        @store.putBatch puts, =>
          if success? then success()            
        , error
      else
        if success? then success()
    , error

  uncache: (selector, success, error) ->
    compiledSelector = utils.compileDocumentSelector(selector)

    # Get all docs from collection
    @store.query (matches) =>
      # Filter ones to remove
      matches = _.filter matches, (m) -> m.state == "cached" and compiledSelector(m.doc)
      keys = _.map(matches, (m) => [@name, m.doc._id])
      if keys.length > 0
        @store.removeBatch keys, =>
          if success? then success()
        , error
      else
        if success? then success()
    , { index: "col", keyRange: @store.makeKeyRange(only: @name), onError: error }

  uncacheList: (ids, success, error) ->
    idIndex = _.indexBy(ids)

    # Android 2.x requires error callback
    error = error or -> return

    # Get all docs from collection
    @store.query (matches) =>
      # Filter ones to remove
      matches = _.filter matches, (m) -> m.state == "cached" and idIndex[m.doc._id]
      keys = _.map(matches, (m) => [@name, m.doc._id])
      if keys.length > 0
        @store.removeBatch keys, =>
          if success? then success()
        , error
      else
        if success? then success()
    , { index: "col", keyRange: @store.makeKeyRange(only: @name), onError: error }
