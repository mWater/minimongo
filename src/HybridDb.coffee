###

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

###

processFind = require('./utils').processFind

module.exports = class HybridDb
  constructor: (localDb, remoteDb) ->
    @localDb = localDb
    @remoteDb = remoteDb
    @collections = {}

    # Add events
    _.extend(this, Backbone.Events)

  addCollection: (name) ->
    collection = new HybridCollection(name, @localDb[name], @remoteDb[name])
    @[name] = collection
    @collections[name] = collection

    collection.on 'change', =>
      @trigger 'change'

  removeCollection: (name) ->
    delete @[name]
    delete @collections[name]
  
  upload: (success, error) ->
    cols = _.values(@collections)

    uploadCols = (cols, success, error) =>
      col = _.first(cols)
      if col
        col.upload(() =>
          uploadCols(_.rest(cols), success, error)
        , (err) =>
          error(err))
      else
        success()
    uploadCols(cols, success, error)

class HybridCollection
  constructor: (name, localCol, remoteCol) ->
    @name = name
    @localCol = localCol
    @remoteCol = remoteCol

    # Add events
    _.extend(this, Backbone.Events)

  # options.mode defaults to "hybrid".
  # In "hybrid", it will return local results, then hit remote and return again if different
  # If remote gives error, it will be ignored
  # In "remote", it will call remote and not cache, but integrates local upserts/deletes
  # If remote gives error, then it will return local results
  # In "local", just returns local results
  find: (selector, options = {}) ->
    return fetch: (success, error) =>
      @_findFetch(selector, options, success, error)

  # options.mode defaults to "hybrid".
  # In "hybrid", it will return local if present, otherwise fall to remote without returning null
  # If remote gives error, then it will return null if none locally. If remote and local differ, it
  # will return twice
  # In "local", it will return local if present. If not present, only then will it hit remote.
  # If remote gives error, then it will return null
  # In "remote"... (not implemented)
  findOne: (selector, options = {}, success, error) ->
    if _.isFunction(options) 
      [options, success, error] = [{}, options, success]

    mode = options.mode || "hybrid"

    if mode == "hybrid" or mode == "local"
      options.limit = 1
      @localCol.findOne selector, options, (localDoc) =>
        # If found, return
        if localDoc
          success(localDoc)
          # No need to hit remote if local
          if mode == "local"
            return 

        remoteSuccess = (remoteDoc) =>
          # Cache
          cacheSuccess = =>
            # Try query again
            @localCol.findOne selector, options, (localDoc2) =>
              if not _.isEqual(localDoc, localDoc2)
                success(localDoc2)
              else if not localDoc
                success(null)

          docs = if remoteDoc then [remoteDoc] else []
          @localCol.cache(docs, selector, options, cacheSuccess, error)

        remoteError = =>
          # Remote errored out. Return null if local did not return
          if not localDoc
            success(null)

        # Call remote
        @remoteCol.findOne selector, _.omit(options, 'fields'), remoteSuccess, remoteError
      , error
    else 
      throw new Error("Unknown mode")

  _findFetch: (selector, options, success, error) ->
    mode = options.mode || "hybrid"

    if mode == "hybrid"
      # Get local results
      localSuccess = (localData) =>
        # Return data immediately
        success(localData)

        # Get remote data
        remoteSuccess = (remoteData) =>
          # Cache locally
          cacheSuccess = () =>
            # Get local data again
            localSuccess2 = (localData2) =>
              # Check if different
              if not _.isEqual(localData, localData2)
                # Send again
                success(localData2)
            @localCol.find(selector, options).fetch(localSuccess2)
          @localCol.cache(remoteData, selector, options, cacheSuccess, error)
        @remoteCol.find(selector, _.omit(options, "fields")).fetch(remoteSuccess)

      @localCol.find(selector, options).fetch(localSuccess, error)
    else if mode == "local"
      @localCol.find(selector, options).fetch(success, error)
    else if mode == "remote"
      # Get remote results
      remoteSuccess = (remoteData) =>
        # Remove local remotes
        data = remoteData

        @localCol.pendingRemoves (removes) =>
          if removes.length > 0
            removesMap = _.object(_.map(removes, (id) -> [id, id]))
            data = _.filter remoteData, (doc) ->
              return not _.has(removesMap, doc._id)

          # Add upserts
          @localCol.pendingUpserts (upserts) =>
            if upserts.length > 0
              # Remove upserts from data
              upsertsMap = _.object(_.pluck(upserts, '_id'), _.pluck(upserts, '_id'))
              data = _.filter data, (doc) ->
                return not _.has(upsertsMap, doc._id)

              # Add upserts
              data = data.concat(upserts)

              # Refilter/sort/limit
              data = processFind(data, selector, options)

            success(data)

      remoteError = =>
        # Call local
        @localCol.find(selector, options).fetch(success, error)

      @remoteCol.find(selector, options).fetch(remoteSuccess, remoteError)
    else
      throw new Error("Unknown mode")

  upsert: (doc, success, error) ->
    @localCol.upsert(doc, (result) =>
      @trigger 'change'
      success(result) if success?
    , error)

  remove: (id, success, error) ->
    @localCol.remove(id, () =>
      @trigger 'change'
      success() if success?
    , error)  

  upload: (success, error) ->
    uploadUpserts = (upserts, success, error) =>
      upsert = _.first(upserts)
      if upsert
        @remoteCol.upsert(upsert, () =>
          @localCol.resolveUpsert upsert, =>
            uploadUpserts(_.rest(upserts), success, error)
        , (err) =>
          error(err))
      else 
        success()
    @localCol.pendingUpserts (upserts) =>
      uploadUpserts(upserts, success, error)
