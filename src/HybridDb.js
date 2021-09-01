###

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

###

_ = require 'lodash'
processFind = require('./utils').processFind
utils = require('./utils')

# Bridges a local and remote database, querying from the local first and then 
# getting the remote. Also uploads changes from local to remote.
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

    uploadCols = (cols, success, error) ->
      col = _.first(cols)
      if col
        col.upload(->
          uploadCols(_.rest(cols), success, error)
        , (err) ->
          error(err))
      else
        success()
    uploadCols(cols, success, error)

  getCollectionNames: -> _.keys(@collections)

class HybridCollection
  # Options includes
  constructor: (name, localCol, remoteCol, options) ->
    @name = name
    @localCol = localCol
    @remoteCol = remoteCol

    # Default options
    @options = options or {}
    _.defaults @options, {
      cacheFind: true       # Cache find results in local db
      cacheFindOne: true    # Cache findOne results in local db
      interim: true         # Return interim results from local db while waiting for remote db. Return again if different
      useLocalOnRemoteError: true  # Use local results if the remote find fails. Only applies if interim is false.
      shortcut: false       # true to return `findOne` results if any matching result is found in the local database. Useful for documents that change rarely.
      timeout: 0            # Set to ms to timeout in for remote calls
      sortUpserts: null     # Compare function to sort upserts sent to server
    }

  find: (selector, options = {}) ->
    return fetch: (success, error) =>
      @_findFetch(selector, options, success, error)

  # Finds one row.
  findOne: (selector, options = {}, success, error) ->
    if _.isFunction(options)
      [options, success, error] = [{}, options, success]

    # Merge options
    _.defaults(options, @options)

    # Happens after initial find
    step2 = (localDoc) =>
      findOptions = _.cloneDeep(options)
      findOptions.interim = false
      findOptions.cacheFind = options.cacheFindOne
      if selector._id
        findOptions.limit = 1
      else
        # Without _id specified, interaction between local and remote changes is complex
        # For example, if the one result returned by remote is locally deleted, we have no fallback
        # So instead we do a find with no limit and then take the first result, which is very inefficient
        delete findOptions.limit

      @find(selector, findOptions).fetch (data) ->
        # Return first entry or null
        if data.length > 0
          # Check that different from existing
          if not _.isEqual(localDoc, data[0])
            success(data[0])
        else
          # If nothing found, always report it, as interim find doesn't return null
          success(null)
      , error

    # If interim or shortcut, get local first
    if options.interim or options.shortcut
      @localCol.findOne selector, options, (localDoc) ->
        # If found, return
        if localDoc
          success(_.cloneDeep(localDoc))

          # If shortcut, we're done
          if options.shortcut
            return
        step2(localDoc)
      , error
    else
      step2()

  _findFetch: (selector, options, success, error) ->
    # Merge options
    _.defaults(options, @options)

    # Get pending removes and upserts immediately to avoid odd race conditions
    @localCol.pendingUpserts (upserts) =>
      @localCol.pendingRemoves (removes) =>

        step2 = (localData) =>
          # Setup remote options
          remoteOptions = _.cloneDeep(options)

          # If caching, get all fields
          if options.cacheFind
            delete remoteOptions.fields

          # Add localData to options for remote find for quickfind protocol
          remoteOptions.localData = localData

          # Setup timer variables
          timer = null
          timedOut = false

          remoteSuccess = (remoteData) =>
            # Cancel timer
            if timer
              clearTimeout(timer)

            # Ignore if timed out, caching asynchronously
            if timedOut
              if options.cacheFind
                @localCol.cache(remoteData, selector, options, (->), error)
              return

            if options.cacheFind
              # Cache locally
              cacheSuccess = =>
                # Get local data again
                localSuccess2 = (localData2) ->
                  # Check if different or not interim
                  if not options.interim or not _.isEqual(localData, localData2)
                    # Send again
                    success(localData2)
                @localCol.find(selector, options).fetch(localSuccess2, error)

              # Exclude any recent upserts/removes to prevent race condition
              cacheOptions = _.extend({}, options, exclude: removes.concat(_.map(upserts, (u) => u.doc._id)))
              @localCol.cache(remoteData, selector, cacheOptions, cacheSuccess, error)
            else
              # Remove local remotes
              data = remoteData

              if removes.length > 0
                removesMap = _.object(_.map(removes, (id) -> [id, id]))
                data = _.filter remoteData, (doc) ->
                  return not _.has(removesMap, doc._id)

              # Add upserts
              if upserts.length > 0
                # Remove upserts from data
                upsertsMap = _.object(_.map(upserts, (u) -> u.doc._id), _.map(upserts, (u) -> u.doc._id))
                data = _.filter data, (doc) ->
                  return not _.has(upsertsMap, doc._id)

                # Add upserts
                data = data.concat(_.pluck(upserts, "doc"))

                # Refilter/sort/limit
                data = processFind(data, selector, options)

              # Check if different or not interim
              if not options.interim or not _.isEqual(localData, data)
                # Send again
                success(data)

          remoteError = (err) =>
            # Cancel timer
            if timer
              clearTimeout(timer)

            if timedOut
              return

            # If no interim, do local find
            if not options.interim
              if options.useLocalOnRemoteError
                success(localData)
              else
                if error then error(err)
            else
              # Otherwise do nothing
              return

          # Start timer if remote
          if options.timeout
            timer = setTimeout () =>
              timer = null
              timedOut = true

              # If no interim, do local find
              if not options.interim
                if options.useLocalOnRemoteError
                  @localCol.find(selector, options).fetch(success, error)
                else
                  if error then error(new Error("Remote timed out"))
              else
                # Otherwise do nothing
                return
            , options.timeout

          @remoteCol.find(selector, remoteOptions).fetch(remoteSuccess, remoteError)

        localSuccess = (localData) ->
          # If interim, return data immediately
          if options.interim
            success(localData)
          step2(localData)

        # Always get local data first
        @localCol.find(selector, options).fetch(localSuccess, error)
      , error
    , error

  upsert: (docs, bases, success, error) ->
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    @localCol.upsert(_.pluck(items, "doc"), _.pluck(items, "base"), (result) ->
      success?(docs)
    , error)

  remove: (id, success, error) ->
    @localCol.remove(id, ->
      success() if success?
    , error)

  upload: (success, error) ->
    uploadUpserts = (upserts, success, error) =>
      upsert = _.first(upserts)
      if upsert
        @remoteCol.upsert upsert.doc, upsert.base, (remoteDoc) =>
          @localCol.resolveUpserts [upsert], =>
            # Cache new value if present
            if remoteDoc
              @localCol.cacheOne remoteDoc, ->
                uploadUpserts(_.rest(upserts), success, error)
              , error
            else
              # Remove local
              @localCol.remove upsert.doc._id, =>
                # Resolve remove
                @localCol.resolveRemove upsert.doc._id, ->
                  uploadUpserts(_.rest(upserts), success, error)
                , error
              , error
          , error
        , (err) =>
          # If 410 error or 403, remove document
          if err.status == 410 or err.status == 403
            @localCol.remove upsert.doc._id, =>
              # Resolve remove
              @localCol.resolveRemove upsert.doc._id, ->
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
        @remoteCol.remove remove, =>
          @localCol.resolveRemove remove, ->
            uploadRemoves(_.rest(removes), success, error)
          , error
        , (err) =>
          # If 403 or 410, remove document
          if err.status == 410 or err.status == 403
            @localCol.resolveRemove remove, ->
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
      # Sort upserts if sort defined
      if @options.sortUpserts
        upserts.sort((u1, u2) => @options.sortUpserts(u1.doc, u2.doc))
        
      uploadUpserts upserts, =>
        @localCol.pendingRemoves (removes) ->
          uploadRemoves(removes, success, error)
        , error
      , error
    , error
