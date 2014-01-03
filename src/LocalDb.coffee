createUid = require('./utils').createUid
processFind = require('./utils').processFind
compileSort = require('./selector').compileSort

class LocalDb
  constructor: (options) ->
    @collections = {}

    if options and options.namespace and window.localStorage
      @namespace = options.namespace

  addCollection: (name) ->
    # Set namespace for collection
    namespace = @namespace+"."+name if @namespace

    collection = new Collection(name, namespace)
    @[name] = collection
    @collections[name] = collection

  removeCollection: (name) ->
    if @namespace and window.localStorage
      keys = []
      for i in [0...window.localStorage.length]
        keys.push(window.localStorage.key(i))

      for key in keys
        if key.substring(0, @namespace.length + 1) == @namespace + "."
          window.localStorage.removeItem(key)

    delete @[name]
    delete @collections[name]


# Stores data in memory, optionally backed by local storage
class Collection
  constructor: (name, namespace) ->
    @name = name
    @namespace = namespace

    @items = {}
    @upserts = {}  # Pending upserts by _id. Still in items
    @removes = {}  # Pending removes by _id. No longer in items

    # Read from local storage
    if window.localStorage and namespace?
      @loadStorage()

  loadStorage: ->
    # Read items from localStorage
    @itemNamespace = @namespace + "_"

    for i in [0...window.localStorage.length]
      key = window.localStorage.key(i)
      if key.substring(0, @itemNamespace.length) == @itemNamespace
        item = JSON.parse(window.localStorage[key])
        @items[item._id] = item

    # Read upserts
    upsertKeys = if window.localStorage[@namespace+"upserts"] then JSON.parse(window.localStorage[@namespace+"upserts"]) else []
    for key in upsertKeys
      @upserts[key] = @items[key]

    # Read removes
    removeItems = if window.localStorage[@namespace+"removes"] then JSON.parse(window.localStorage[@namespace+"removes"]) else []
    @removes = _.object(_.pluck(removeItems, "_id"), removeItems)

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
    if success? then success(processFind(@items, selector, options))

  upsert: (doc, success, error) ->
    if not doc._id
      doc._id = createUid()

    # Replace/add 
    @_putItem(doc)
    @_putUpsert(doc)

    if success? then success(doc)

  remove: (id, success, error) ->
    if _.has(@items, id)
      @_putRemove(@items[id])
      @_deleteItem(id)
      @_deleteUpsert(id)

    if success? then success()

  _putItem: (doc) ->
    @items[doc._id] = doc
    if @namespace
      window.localStorage[@itemNamespace + doc._id] = JSON.stringify(doc)

  _deleteItem: (id) ->
    delete @items[id]
    if @namespace
      window.localStorage.removeItem(@itemNamespace + id)

  _putUpsert: (doc) ->
    @upserts[doc._id] = doc
    if @namespace
      window.localStorage[@namespace+"upserts"] = JSON.stringify(_.keys(@upserts))

  _deleteUpsert: (id) ->
    delete @upserts[id]
    if @namespace
      window.localStorage[@namespace+"upserts"] = JSON.stringify(_.keys(@upserts))

  _putRemove: (doc) ->
    @removes[doc._id] = doc
    if @namespace
      window.localStorage[@namespace+"removes"] = JSON.stringify(_.values(@removes))

  _deleteRemove: (id) ->
    delete @removes[id]
    if @namespace
      window.localStorage[@namespace+"removes"] = JSON.stringify(_.values(@removes))

  cache: (docs, selector, options, success, error) ->
    # Add all non-local that are not upserted or removed
    for doc in docs
      if not _.has(@upserts, doc._id) and not _.has(@removes, doc._id)
        @_putItem(doc)

    docsMap = _.object(_.pluck(docs, "_id"), docs)

    if options.sort
      sort = compileSort(options.sort)

    # Perform query, removing rows missing in docs from local db 
    @find(selector, options).fetch (results) =>
      for result in results
        if not docsMap[result._id] and not _.has(@upserts, result._id)
          # If past end on sorted limited, ignore
          if options.sort and options.limit and docs.length == options.limit
            if sort(result, _.last(docs)) >= 0
              continue
          @_deleteItem(result._id)

      if success? then success()  
    , error
    
  pendingUpserts: (success) ->
    success _.values(@upserts)

  pendingRemoves: (success) ->
    success _.pluck(@removes, "_id")

  resolveUpsert: (doc, success) ->
    if @upserts[doc._id]
      # Only safely remove upsert if doc received back from 
      # server is the same, excluding certain server-added fields (_rev, created, modified)
      # or server-modified fields (user, org)
      serverFields = ['_rev', 'created', 'modified', 'user', 'org']
      if _.isEqual(_.omit(doc, serverFields), _.omit(@upserts[doc._id], serverFields))
        @_deleteUpsert(doc._id)
    if success? then success()

  resolveRemove: (id, success) ->
    @_deleteRemove(id)
    if success? then success()

  # Add but do not overwrite or record as upsert
  seed: (doc, success) ->
    if not _.has(@items, doc._id) and not _.has(@removes, doc._id)
      @_putItem(doc)
    if success? then success()

module.exports = LocalDb
