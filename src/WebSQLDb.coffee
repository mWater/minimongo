_ = require 'lodash'
async = require 'async'

createUid = require('./utils').createUid
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

module.exports = class IndexedDb
  constructor: (options, success, error) ->
    @collections = {}

    # Create database
    # TODO escape name
    @db = window.openDatabase 'minimongo_' + options.namespace, '1.0', 'Minimongo:' + options.namespace, 50 * 1024 * 1024
    if not @db
      return error("Failed to create database")

    createTables = (tx) =>
      tx.executeSql('''
        CREATE TABLE IF NOT EXISTS docs (
          col TEXT NOT NULL,
          id TEXT NOT NULL,
          state TEXT NOT NULL,
          doc TEXT, 
          PRIMARY KEY (col, id));''')

     # Create tables
     @db.transaction(createTables, error, success)

  addCollection: (name, success, error) ->
    collection = new Collection(name, @db)
    @[name] = collection
    @collections[name] = collection
    if success
      success() 

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]

    # Remove all documents of collection
    @db.transaction (tx) =>
      tx.executeSql("DELETE FROM docs WHERE col = ?", [name], success)
    , error

# Stores data in indexeddb store
class Collection
  constructor: (name, db) ->
    @name = name
    @db = db

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
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ?", [@name], (tx, results) =>
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          if row.state != "removed"
            docs.push JSON.parse(row.doc)
        if success? then success(processFind(docs, selector, options))   
    , error

  upsert: (doc, success, error) ->
    if not doc._id
      doc._id = createUid()

    @db.transaction (tx) =>
      tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "upserted", JSON.stringify(doc)], =>
        if success then success(doc)
    , error

  remove: (id, success, error) ->
    # Find record
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, id], (tx, results) =>
        if results.rows.length > 0
          # Change to removed
          tx.executeSql 'UPDATE docs SET state="removed" WHERE col = ? AND id = ?', [@name, id], =>
            if success then success(id)
        else
          tx.executeSql "INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, id, "removed", JSON.stringify({_id: id})], =>
            if success then success(id)
    , error

  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    async.each docs, (doc, callback) =>
      @db.transaction (tx) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
          # Check if present and not upserted/deleted
          if results.rows.length == 0 or results.rows.item(0).state == "cached"
            # Upsert
            tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "cached", JSON.stringify(doc)], =>
              callback()
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
          @db.transaction (tx) =>
            tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, result._id], (tx, rows) =>
              if not docsMap[result._id] and rows.rows.length > 0 and rows.rows.item(0).state == "cached"
                # If past end on sorted limited, ignore
                if options.sort and options.limit and docs.length == options.limit
                  if sort(result, _.last(docs)) >= 0
                    return callback()
                
                # Item is gone from server, remove locally
                tx.executeSql "DELETE FROM docs WHERE col = ? AND id = ?", [@name, result._id], =>
                  callback()
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
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND state = ?", [@name, "upserted"], (tx, results) =>
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          docs.push JSON.parse(row.doc)
        if success? then success(docs)
    , error

  pendingRemoves: (success, error) ->
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND state = ?", [@name, "removed"], (tx, results) =>
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          docs.push JSON.parse(row.doc)._id
        if success? then success(docs)
    , error

  resolveUpsert: (doc, success, error) ->
    # Find record
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
        if results.rows.length > 0
          # Only safely remove upsert if doc is the same
          if results.rows.item(0).state == "upserted" and _.isEqual(JSON.parse(results.rows.item(0).doc), doc)
            tx.executeSql 'UPDATE docs SET state="cached" WHERE col = ? AND id = ?', [@name, doc._id], =>
              if success then success(doc)
          else
            if success then success(doc)
        else
          error(new Error("Upsert not found"))
    , error

  resolveRemove: (id, success, error) ->
    # Find record
    @db.transaction (tx) =>
      # Only safely remove if removed state
      tx.executeSql 'DELETE FROM docs WHERE state="removed" AND col = ? AND id = ?', [@name, id], =>
        if success then success(id)
    , error

  # Add but do not overwrite or record as upsert
  seed: (doc, success, error) ->
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
        # Only insert if not present 
        if results.rows.length == 0
          tx.executeSql "INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "cached", JSON.stringify(doc)], =>
            if success then success(doc)
        else
          if success then success(doc)
    , error
