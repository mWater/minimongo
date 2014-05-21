_ = require 'lodash'
async = require 'async'
IDBStore = require 'idb-wrapper'

createUid = require('./utils').createUid
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

# Create a database backed by IndexedDb. options must contain namespace: <string to uniquely identify database>
module.exports = class IndexedDb
  constructor: (options, success, error) ->
    @collections = {}

    # Create database
    @store = new IDBStore {
      dbVersion: 1
      storeName: 'minimongo_' + options.namespace
      keyPath: ['col', 'doc._id']
      autoIncrement: false
      onStoreReady: () => if success then success(this)
      onError: error
      indexes: [
        { name: 'col', keyPath: 'col', unique: false, multiEntry: false }
        { name: 'col-state', keyPath: ['col', 'state'], unique: false, multiEntry: false}
      ]
    }

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
      keys = _.map matches, (m) => [ m.col, m.doc._id ]
      if keys.length > 0
        @store.removeBatch keys, => 
          if success? then success()
        , error
      else
        if success? then success()
    , { index: "col", keyRange: @store.makeKeyRange(only: name), onError: error }

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
    @store.query (matches) =>
      # Filter removed docs
      matches = _.filter matches, (m) => m.state != "removed"
      if success? then success(processFind(_.pluck(matches, "doc"), selector, options))  
    , { index: "col", keyRange: @store.makeKeyRange(only: @name), onError: error }

  upsert: (doc, success, error) ->
    # Handle both single and multiple upsert
    items = doc
    if not _.isArray(items)
      items = [items]

    for item in items
      if not item._id
        item._id = createUid()

    records = _.map items, (item) =>
      return {
        col: @name
        state: "upserted"
        doc: item
      }

    @store.putBatch records, => 
      if success then success(doc)
    , error

  remove: (id, success, error) ->
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
      @store.put record, =>
        if success then success(id)
      , error

  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    async.each docs, (doc, callback) =>
      # Check if not present or not upserted/deleted
      @store.get [@name, doc._id], (record) =>
        if not record? or record.state == "cached"
          @store.put { col: @name, state: "cached", doc: doc }, =>
            callback()
          , callback
        else
          callback()
      , callback
    , (err) =>
      if err
        if error then error(err)
        return

      # Rows have been cached, now look for stale ones to remove
      docsMap = _.object(_.pluck(docs, "_id"), docs)

      if options.sort
        sort = compileSort(options.sort)

      # Perform query, removing rows missing in docs from local db 
      @find(selector, options).fetch (results) =>
        async.each results, (result, callback) =>
          # If not present in docs and is present locally and not upserted/deleted
          @store.get [@name, result._id], (record) =>
            if not docsMap[result._id] and record and record.state == "cached"
              # If past end on sorted limited, ignore
              if options.sort and options.limit and docs.length == options.limit
                if sort(result, _.last(docs)) >= 0
                  return callback()
              # Item is gone from server, remove locally
              @store.remove [@name, result._id], =>
                callback()
              , callback
            else
              callback()
          , callback
        , (err) =>
          if err?
            if error? then error(err)
            return
          if success? then success()  
      , error
    
  pendingUpserts: (success, error) ->
    @store.query (matches) =>
      if success? then success(_.pluck(matches, "doc"))
    , { index: "col-state", keyRange: @store.makeKeyRange(only: [@name, "upserted"]), onError: error }

  pendingRemoves: (success, error) ->
    @store.query (matches) =>
      if success? then success(_.pluck(_.pluck(matches, "doc"), "_id"))
    , { index: "col-state", keyRange: @store.makeKeyRange(only: [@name, "removed"]), onError: error }

  resolveUpsert: (doc, success, error) ->
    @store.get [@name, doc._id], (record) =>
      # Only safely remove upsert if doc is the same
      if record.state == "upserted" and _.isEqual(record.doc, doc)
        record.state = "cached"
        @store.put record, => 
          if success then success(doc)
        , error
      else
        if success? then success()

  resolveRemove: (id, success, error) ->
    @store.get [@name, id], (record) =>
      # Only remove if removed
      if record.state == "removed"
        @store.remove [@name, id], =>
          if success? then success()
        , error

  # Add but do not overwrite or record as upsert
  seed: (doc, success, error) ->
    @store.get [@name, doc._id], (record) =>
      if not record?
        record = {
          col: @name
          state: "cached"
          doc: doc
        }
        @store.put record, =>
          if success? then success()
        , error
      else
        if success? then success()

  # Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne: (doc, success, error) ->
    @store.get [@name, doc._id], (record) =>
      if not record?
        record = {
          col: @name
          state: "cached"
          doc: doc
        }
      if record.state == "cached"
        record.doc = doc
        @store.put record, =>
          if success? then success()
        , error
      else
        if success? then success()
