###

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

###

_ = require 'lodash'
processFind = require('./utils').processFind

module.exports = class HybridDb
  constructor: (localDb, remoteDb) ->
    @localDb = localDb
    @remoteDb = remoteDb
    @collections = {}

  addCollection: (name, options, success, error) ->
    # Shift options over if not present
    if _.isFunction(options) 
      [options, success, error] = [{}, options, success]

    collection = new HybridCollection(name, @localDb[name], @remoteDb[name], options)
    @[name] = collection
    @collections[name] = collection
    if success? then success()

  removeCollection: (name, success, error) ->
    delete @[name]
    delete @collections[name]
    if success? then success()
  
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
  # Options includes 
  constructor: (name, localCol, remoteCol, options) ->
    @name = name
    @localCol = localCol
    @remoteCol = remoteCol

    # Default options
    options = options or {}
    _.defaults(options, { caching: true })

    # Extract options
    @caching = options.caching

  # options.mode defaults to "hybrid" (unless caching=false, in which case "remote")
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
  # In "remote", it gets remote and integrates local changes. Much more efficient if _id specified
  # If remote gives error, falls back to local if caching
  findOne: (selector, options = {}, success, error) ->
    if _.isFunction(options) 
      [options, success, error] = [{}, options, success]

    mode = options.mode || (if @caching then "hybrid" else "remote")

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
    else if mode == "remote"
      # If _id specified, use remote findOne
      if selector._id 
        remoteSuccess2 = (remoteData) =>
          # Check for local upsert
          @localCol.pendingUpserts (pendingUpserts) =>
            localData = _.findWhere(pendingUpserts, { _id: selector._id })
            if localData
              return success(localData)

            # Check for local remove
            @localCol.pendingRemoves (pendingRemoves) =>
              if selector._id in pendingRemoves
                # Removed, success null
                return success(null)

              success(remoteData)
          , error

        # Get remote response
        @remoteCol.findOne selector, options, remoteSuccess2, error
      else
        # Without _id specified, interaction between local and remote changes is complex
        # For example, if the one result returned by remote is locally deleted, we have no fallback
        # So instead we do a normal find and then take the first result, which is very inefficient
        @find(selector, options).fetch (findData) =>
          if findData.length > 0
            success(findData[0])
          else
            success(null)
        , (err) =>
          # Call local if caching
          if @caching
            @localCol.findOne(selector, options, success, error)
          else
            # Otherwise bubble up
            if error
              error(err)

    else
      throw new Error("Unknown mode")

  _findFetch: (selector, options, success, error) ->
    mode = options.mode || (if @caching then "hybrid" else "remote")

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
            @localCol.find(selector, options).fetch(localSuccess2, error)
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

      remoteError = (err) =>
        # Call local if caching
        if @caching
          @localCol.find(selector, options).fetch(success, error)
        else
          # Otherwise bubble up
          if error
            error(err)

      @remoteCol.find(selector, options).fetch(remoteSuccess, remoteError)
    else
      throw new Error("Unknown mode")

  upsert: (doc, success, error) ->
    @localCol.upsert(doc, (result) =>
      success(result) if success?
    , error)

  remove: (id, success, error) ->
    @localCol.remove(id, () =>
      success() if success?
    , error)  

  upload: (success, error) ->
    uploadUpserts = (upserts, success, error) =>
      upsert = _.first(upserts)
      if upsert
        @remoteCol.upsert upsert, (remoteDoc) =>
          @localCol.resolveUpsert upsert, =>
            # Cache new value if caching
            if @caching
              @localCol.cacheOne remoteDoc, =>
                uploadUpserts(_.rest(upserts), success, error)
              , error
            else
              # Remove document
              @localCol.remove upsert._id, =>
                # Resolve remove
                @localCol.resolveRemove upsert._id, =>
                  uploadUpserts(_.rest(upserts), success, error)
                , error
              , error
          , error
        , (err) =>
          # If 410 error or 403, remove document
          if err.status == 410 or err.status == 403
            @localCol.remove upsert._id, =>
              # Resolve remove
              @localCol.resolveRemove upsert._id, =>
                # Continue if was 410
                if err.status == 410
                  uploadUpserts(_.rest(upserts), success, error)
                else
                  error(err)
              , error
            , error
          else
            error(err)
      else 
        success()

    uploadRemoves = (removes, success, error) =>
      remove = _.first(removes)
      if remove
        @remoteCol.remove remove, () =>
          @localCol.resolveRemove remove, =>
            uploadRemoves(_.rest(removes), success, error)
          , error
        , (err) =>
          # If 403 or 410, remove document 
          if err.status == 410 or err.status == 403
            @localCol.resolveRemove remove, =>
              # Continue if was 410
              if err.status == 410
                uploadRemoves(_.rest(removes), success, error)
              else
                error(err)
            , error
          else
            error(err)          
        , error
      else 
        success()

    # Get pending upserts
    @localCol.pendingUpserts (upserts) =>
      uploadUpserts upserts, =>
        @localCol.pendingRemoves (removes) =>
          uploadRemoves(removes, success, error)
        , error
      , error
    , error
