###

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

###

_ = require 'lodash'
processFind = require('./utils').processFind
utils = require('./utils')

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
      findOptions.useLocalOnRemoteError = true
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

    step2 = (localData) =>
      # Setup remote options
      remoteOptions = _.cloneDeep(options)

      # If caching, get all fields
      if options.cacheFind
        delete remoteOptions.fields

      remoteSuccess = (remoteData) =>
        if options.cacheFind
          # Cache locally
          cacheSuccess = =>
            # Get local data again
            localSuccess2 = (localData2) ->
              # Check if different
              if not _.isEqual(localData, localData2)
                # Send again
                success(localData2)
            @localCol.find(selector, options).fetch(localSuccess2, error)
          @localCol.cache(remoteData, selector, options, cacheSuccess, error)
        else
          # Remove local remotes
          data = remoteData

          @localCol.pendingRemoves (removes) =>
            if removes.length > 0
              removesMap = _.object(_.map(removes, (id) -> [id, id]))
              data = _.filter remoteData, (doc) ->
                return not _.has(removesMap, doc._id)

            # Add upserts
            @localCol.pendingUpserts (upserts) ->
              if upserts.length > 0
                # Remove upserts from data
                upsertsMap = _.object(_.map(upserts, (u) -> u.doc._id), _.map(upserts, (u) -> u.doc._id))
                data = _.filter data, (doc) ->
                  return not _.has(upsertsMap, doc._id)

                # Add upserts
                data = data.concat(_.pluck(upserts, "doc"))

                # Refilter/sort/limit
                data = processFind(data, selector, options)

              # Check if different
              if not _.isEqual(localData, data)
                # Send again
                success(data)
            , error
          , error

      remoteError = (err) =>
        # If no interim, do local find
        if not options.interim
          if options.useLocalOnRemoteError
            @localCol.find(selector, options).fetch(success, error)
          else
            if error then error(err)
        else
          # Otherwise do nothing
          return

      @remoteCol.find(selector, remoteOptions).fetch(remoteSuccess, remoteError)

    # If interim, get local first
    if options.interim
      localSuccess = (localData) ->
        # Return data immediately
        success(localData)
        step2(localData)
      @localCol.find(selector, options).fetch(localSuccess, error)
    else
      step2()

  upsert: (docs, bases, success, error) ->
    @localCol.upsert(docs, bases, (result) ->
      success(docs) if success?
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
            # Cache new value
            @localCol.cacheOne remoteDoc, ->
              uploadUpserts(_.rest(upserts), success, error)
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
      uploadUpserts upserts, =>
        @localCol.pendingRemoves (removes) ->
          uploadRemoves(removes, success, error)
        , error
      , error
    , error
