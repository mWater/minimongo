_ = require 'lodash'
async = require 'async'

utils = require('./utils')
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

# Do nothing callback for success
doNothing = -> return

# WebSQLDb adapter for minimongo DB
# Supports sqlite plugin, if available and specified in option as {storage: 'sqlite'}
module.exports = class WebSQLDb
  constructor: (options, success, error) ->
    @collections = {}

    if options.storage == 'sqlite' and window.sqlitePlugin
      # sqlite plugin does not support db.version
      # and since db operations can only be executed once the db is properly open
      # we add the schema version migration to the success callback
      window.sqlitePlugin.openDatabase(
        {name: 'minimongo_' + options.namespace, location: 'default'}
        ,(sqliteDb) =>
          console.log "Database open successful"
          @db = sqliteDb
          console.log("Checking version");
          @db.executeSql("PRAGMA user_version", [], (rs) =>
            version = rs.rows.item(0).user_version
            if version == 0
              @db.transaction (tx) =>
                tx.executeSql('''
                  CREATE TABLE docs (
                  col TEXT NOT NULL,
                  id TEXT NOT NULL,
                  state TEXT NOT NULL,
                  doc TEXT,
                  base TEXT,
                  PRIMARY KEY (col, id));''', [], doNothing, ((tx, err) -> error(err)))
                tx.executeSql("PRAGMA user_version = 2", [], doNothing, ((tx, err) -> error(err)))
                success(this)
            else
              success(this)
            return
          , (err) ->
            console.log "version check error :: ",JSON.stringify(err)
            error(err)
            return
          )
          return
        ,(err) ->
          console.log "Error opening databse :: ", JSON.stringify(err)
          error(err)
          return
        )
    else
      try
        # Create database
        # TODO escape name
        @db = window.openDatabase 'minimongo_' + options.namespace, '', 'Minimongo:' + options.namespace, 5 * 1024 * 1024
        if not @db
          return error(new Error("Failed to create database"))
      catch ex
        if error
          error(ex)
        return

    migrateToV1 = (tx) ->
      tx.executeSql('''
        CREATE TABLE docs (
          col TEXT NOT NULL,
          id TEXT NOT NULL,
          state TEXT NOT NULL,
          doc TEXT,
          PRIMARY KEY (col, id));''', [], doNothing, ((tx, err) -> error(err)))

    migrateToV2 = (tx) ->
      tx.executeSql('''
        ALTER TABLE docs ADD COLUMN base TEXT;''', [], doNothing, ((tx, err) -> error(err)))

    # Check if at v2 version
    checkV2 = =>
      if @db.version == "1.0"
        @db.changeVersion "1.0", "2.0", migrateToV2, error, =>
          if success then success(this)
      else if @db.version != "2.0"
        return error("Unknown db version " + @db.version)
      else
        if success then success(this)

    if not options.storage
      if not @db.version
        @db.changeVersion "", "1.0", migrateToV1, error, checkV2
      else
        checkV2()

    return @db

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
    @db.transaction (tx) ->
      tx.executeSql("DELETE FROM docs WHERE col = ?", [name], success, ((tx, err) -> error(err)))
    , error

  getCollectionNames: -> _.keys(@collections)

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
    # Android 2.x requires error callback
    error = error or -> return

    # Get all docs from collection
    @db.readTransaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ?", [@name], (tx, results) ->
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          if row.state != "removed"
            docs.push JSON.parse(row.doc)
        if success? then success(processFind(docs, selector, options))
      , ((tx, err) -> error(err))
    , error

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      ids = _.map(items, (item) -> item.doc._id)

      # Get bases
      bases = {}
      async.eachSeries ids, (id, callback) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, id], (tx2, results) ->
          tx = tx2
          if results.rows.length > 0
            row = results.rows.item(0)
            if row.state == "upserted"
              bases[row.id] = if row.base then JSON.parse(row.base) else null
            else if row.state == "cached"
              bases[row.id] = JSON.parse(row.doc)
          callback()
        , ((tx, err) -> error(err))
      , =>
        for item in items
          id = item.doc._id

          # Prefer explicit base
          if item.base != undefined
            base = item.base
          else if bases[id]
            base = bases[id]
          else
            base = null
          tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc, base) VALUES (?, ?, ?, ?, ?)",  [@name, item.doc._id, "upserted", JSON.stringify(item.doc), JSON.stringify(base)], doNothing, ((tx, err) -> error(err))
    , error
    , ->
      if success then success(docs)

  remove: (id, success, error) ->
    # Special case for filter-type remove
    if _.isObject(id)
      @find(id).fetch (rows) =>
        async.each rows, (row, cb) =>
          @remove(row._id, (=> cb()), cb)
        , => success()
      , error
      return

    # Android 2.x requires error callback
    error = error or -> return

    # Find record
    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, id], (tx, results) =>
        if results.rows.length > 0
          # Change to removed
          tx.executeSql 'UPDATE docs SET state="removed" WHERE col = ? AND id = ?', [@name, id], ->
            if success then success(id)
          , ((tx, err) -> error(err))
        else
          tx.executeSql "INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, id, "removed", JSON.stringify({_id: id})], ->
            if success then success(id)
          , ((tx, err) -> error(err))
      , ((tx, err) -> error(err))
    , error

  cache: (docs, selector, options, success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      # Add all non-local that are not upserted or removed
      async.eachSeries docs, (doc, callback) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
          # Check if present and not upserted/deleted
          if results.rows.length == 0 or results.rows.item(0).state == "cached"
            existing = if results.rows.length > 0 then JSON.parse(results.rows.item(0).doc) else null

            # Exclude any excluded _ids from being cached/uncached
            if options and options.exclude and doc._id in options.exclude
              callback()
              return

            # If _rev present, make sure that not overwritten by lower or equal _rev
            if not existing or not doc._rev or not existing._rev or doc._rev > existing._rev
              # Upsert
              tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "cached", JSON.stringify(doc)], ->
                callback()
              , ((tx, err) -> error(err))
            else
              callback()
          else
            callback()
        , ((tx, err) -> error(err))
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
          @db.transaction (tx) =>
            async.eachSeries results, (result, callback) =>
              # If not present in docs and is present locally and not upserted/deleted
              tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, result._id], (tx, rows) =>
                if not docsMap[result._id] and rows.rows.length > 0 and rows.rows.item(0).state == "cached"
                  # Exclude any excluded _ids from being cached/uncached
                  if options and options.exclude and result._id in options.exclude
                    callback()
                    return

                  # If at limit
                  if options.limit and docs.length == options.limit
                    # If past end on sorted limited, ignore
                    if options.sort and sort(result, _.last(docs)) >= 0
                      return callback()
                    # If no sort, ignore
                    if not options.sort
                      return callback()

                  # Item is gone from server, remove locally
                  tx.executeSql "DELETE FROM docs WHERE col = ? AND id = ?", [@name, result._id], ->
                    callback()
                  , ((tx, err) -> error(err))
                else
                  callback()
              , ((tx, err) -> error(err))
            , (err) ->
              if err?
                if error? then error(err)
                return
              if success? then success()
          , error
        , error
    , error

  pendingUpserts: (success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    @db.readTransaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND state = ?", [@name, "upserted"], (tx, results) ->
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          docs.push { doc: JSON.parse(row.doc), base: if row.base then JSON.parse(row.base) else null }
        if success? then success(docs)
      , ((tx, err) -> error(err))
    , error

  pendingRemoves: (success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    @db.readTransaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND state = ?", [@name, "removed"], (tx, results) ->
        docs = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          docs.push JSON.parse(row.doc)._id
        if success? then success(docs)
      , ((tx, err) -> error(err))
    , error

  resolveUpserts: (upserts, success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    # Find records
    @db.transaction (tx) =>
      async.eachSeries upserts, (upsert, cb) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, upsert.doc._id], (tx, results) =>
          if results.rows.length > 0 and results.rows.item(0).state == "upserted"
            # Only safely remove upsert if doc is the same
            if _.isEqual(JSON.parse(results.rows.item(0).doc), upsert.doc)
              tx.executeSql 'UPDATE docs SET state="cached" WHERE col = ? AND id = ?', [@name, upsert.doc._id], doNothing, ((tx, err) -> error(err))
              cb()
            else
              tx.executeSql 'UPDATE docs SET base=? WHERE col = ? AND id = ?', [JSON.stringify(upsert.doc), @name, upsert.doc._id], doNothing, ((tx, err) -> error(err))
              cb()
          else
            # Upsert removed, which is fine
            cb()
        , ((tx, err) -> error(err))
      , (err) ->
        if err
          return error(err)

        # Success
        if success then success()
    , error

  resolveRemove: (id, success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    # Find record
    @db.transaction (tx) =>
      # Only safely remove if removed state
      tx.executeSql 'DELETE FROM docs WHERE state="removed" AND col = ? AND id = ?', [@name, id], ->
        if success then success(id)
      , ((tx, err) -> error(err))
    , error

  # Add but do not overwrite or record as upsert
  seed: (docs, success, error) ->
    if not _.isArray(docs)
      docs = [docs]

    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      # Add all non-local that are not upserted or removed
      async.eachSeries docs, (doc, callback) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
          # Check if present
          if results.rows.length == 0
            # Upsert
            tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "cached", JSON.stringify(doc)], ->
              callback()
            , ((tx, err) -> error(err))
          else
            callback()
        , ((tx, err) -> error(err))
      , (err) =>
        if err
          if error then error(err)
        else
          if success then success()
    , error

  # Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne: (doc, success, error) ->
    @cacheList([doc], success, error)

  cacheList: (docs, success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      # Add all non-local that are not upserted or removed
      async.eachSeries docs, (doc, callback) =>
        tx.executeSql "SELECT * FROM docs WHERE col = ? AND id = ?", [@name, doc._id], (tx, results) =>
          # Only insert if not present or cached
          if results.rows.length == 0 or results.rows.item(0).state == "cached"
            existing = if results.rows.length > 0 then JSON.parse(results.rows.item(0).doc) else null

            # If _rev present, make sure that not overwritten by lower or equal _rev
            if not existing or not doc._rev or not existing._rev or doc._rev > existing._rev
              tx.executeSql "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)", [@name, doc._id, "cached", JSON.stringify(doc)], ->
                callback()
              , ((tx, err) -> callback(err))
            else
              callback()
          else
            callback()
        , ((tx, err) -> callback(err))
      , (err) =>
        if err
          if error then error(err)
        else
          if success then success(docs)
    , error

  uncache: (selector, success, error) ->
    compiledSelector = utils.compileDocumentSelector(selector)

    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      tx.executeSql "SELECT * FROM docs WHERE col = ? AND state = ?", [@name, "cached"], (tx, results) =>
        # Determine which to remove
        toRemove = []
        for i in [0...results.rows.length]
          row = results.rows.item(i)
          doc = JSON.parse(row.doc)
          if compiledSelector(doc)
            toRemove.push(doc._id)

        # Add all non-local that are not upserted or removed
        async.eachSeries toRemove, (id, callback) =>
          # Only safely remove if removed state
          tx.executeSql 'DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?', [@name, id], ->
            callback()
          , ((tx, err) -> error(err))
        , (err) =>
          if err
            if error then error(err)
          else
            if success then success()
      , ((tx, err) -> error(err))
    , error

  uncacheList: (ids, success, error) ->
    # Android 2.x requires error callback
    error = error or -> return

    @db.transaction (tx) =>
      # Add all non-local that are not upserted or removed
      async.eachSeries ids, (id, callback) =>
        # Only safely remove if removed state
        tx.executeSql 'DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?', [@name, id], ->
          callback()
        , ((tx, err) -> error(err))
      , (err) =>
        if err
          if error then error(err)
        else
          if success then success()
    , error
