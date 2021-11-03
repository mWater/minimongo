// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let LocalStorageDb
import _ from "lodash"
import { createUid, processFind } from "./utils";
import { compileSort } from "./selector"

export default LocalStorageDb = class LocalStorageDb {
  constructor(options: any, success: any) {
    this.collections = {}

    if (options && options.namespace && window.localStorage) {
      this.namespace = options.namespace
    }

    if (success) {
      success(this)
    }
  }

  addCollection(name: any, success: any, error: any) {
    // Set namespace for collection
    let namespace
    if (this.namespace) {
      namespace = this.namespace + "." + name
    }

    const collection = new Collection(name, namespace)
    this[name] = collection
    this.collections[name] = collection
    if (success != null) {
      return success()
    }
  }

  removeCollection(name: any, success: any, error: any) {
    if (this.namespace && window.localStorage) {
      const keys = []
      for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        keys.push(window.localStorage.key(i))
      }

      for (let key of keys) {
        if (key.substring(0, this.namespace.length + 1) === this.namespace + ".") {
          window.localStorage.removeItem(key)
        }
      }
    }

    delete this[name]
    delete this.collections[name]
    if (success != null) {
      return success()
    }
  }
}

// Stores data in memory, optionally backed by local storage
class Collection {
  constructor(name: any, namespace: any) {
    this.name = name
    this.namespace = namespace

    this.items = {}
    this.upserts = {} // Pending upserts by _id. Still in items
    this.removes = {} // Pending removes by _id. No longer in items

    // Read from local storage
    if (window.localStorage && namespace != null) {
      this.loadStorage()
    }
  }

  loadStorage() {
    // Read items from localStorage
    let key
    this.itemNamespace = this.namespace + "_"

    for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      key = window.localStorage.key(i)
      if (key.substring(0, this.itemNamespace.length) === this.itemNamespace) {
        const item = JSON.parse(window.localStorage[key])
        this.items[item._id] = item
      }
    }

    // Read upserts
    const upsertKeys = window.localStorage[this.namespace + "upserts"]
      ? JSON.parse(window.localStorage[this.namespace + "upserts"])
      : []
    for (key of upsertKeys) {
      this.upserts[key] = this.items[key]
    }

    // Read removes
    const removeItems = window.localStorage[this.namespace + "removes"]
      ? JSON.parse(window.localStorage[this.namespace + "removes"])
      : []
    return (this.removes = _.fromPairs(_.zip(_.map(removeItems, "_id"), removeItems)))
  }

  find(selector: any, options: any) {
    return {
      fetch: (success: any, error: any) => {
        return this._findFetch(selector, options, success, error)
      }
    }
  }

  findOne(selector: any, options: any, success: any, error: any) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    return this.find(selector, options).fetch(function (results: any) {
      if (success != null) {
        return success(results.length > 0 ? results[0] : null)
      }
    }, error)
  }

  _findFetch(selector: any, options: any, success: any, error: any) {
    if (success != null) {
      return success(processFind(this.items, selector, options))
    }
  }

  upsert(doc: any, success: any, error: any) {
    // Handle both single and multiple upsert
    let items = doc
    if (!_.isArray(items)) {
      items = [items]
    }

    // Handle case of array
    for (let item of items) {
      if (!item._id) {
        item._id = createUid()
      }

      // Replace/add
      this._putItem(item)
      this._putUpsert(item)
    }

    if (success) {
      return success(doc)
    }
  }

  remove(id: any, success: any, error: any) {
    if (_.has(this.items, id)) {
      this._putRemove(this.items[id])
      this._deleteItem(id)
      this._deleteUpsert(id)
    } else {
      this._putRemove({ _id: id })
    }

    if (success != null) {
      return success()
    }
  }

  _putItem(doc: any) {
    this.items[doc._id] = doc
    if (this.namespace) {
      return (window.localStorage[this.itemNamespace + doc._id] = JSON.stringify(doc))
    }
  }

  _deleteItem(id: any) {
    delete this.items[id]
    if (this.namespace) {
      return window.localStorage.removeItem(this.itemNamespace + id)
    }
  }

  _putUpsert(doc: any) {
    this.upserts[doc._id] = doc
    if (this.namespace) {
      return (window.localStorage[this.namespace + "upserts"] = JSON.stringify(_.keys(this.upserts)))
    }
  }

  _deleteUpsert(id: any) {
    delete this.upserts[id]
    if (this.namespace) {
      return (window.localStorage[this.namespace + "upserts"] = JSON.stringify(_.keys(this.upserts)))
    }
  }

  _putRemove(doc: any) {
    this.removes[doc._id] = doc
    if (this.namespace) {
      return (window.localStorage[this.namespace + "removes"] = JSON.stringify(_.values(this.removes)))
    }
  }

  _deleteRemove(id: any) {
    delete this.removes[id]
    if (this.namespace) {
      return (window.localStorage[this.namespace + "removes"] = JSON.stringify(_.values(this.removes)))
    }
  }

  cache(docs: any, selector: any, options: any, success: any, error: any) {
    // Add all non-local that are not upserted or removed
    let sort: any
    for (let doc of docs) {
      this.cacheOne(doc)
    }

    const docsMap = _.fromPairs(_.zip(_.map(docs, "_id"), docs))

    if (options.sort) {
      sort = compileSort(options.sort)
    }

    // Perform query, removing rows missing in docs from local db
    return this.find(selector, options).fetch((results: any) => {
      for (let result of results) {
        if (!docsMap[result._id] && !_.has(this.upserts, result._id)) {
          // If past end on sorted limited, ignore
          if (options.sort && options.limit && docs.length === options.limit) {
            if (sort(result, _.last(docs)) >= 0) {
              continue
            }
          }
          this._deleteItem(result._id)
        }
      }

      if (success != null) {
        return success()
      }
    }, error)
  }

  pendingUpserts(success: any) {
    return success(_.values(this.upserts))
  }

  pendingRemoves(success: any) {
    return success(_.map(this.removes, "_id"))
  }

  resolveUpsert(doc: any, success: any) {
    // Handle both single and multiple upsert
    let items = doc
    if (!_.isArray(items)) {
      items = [items]
    }

    for (let item of items) {
      if (this.upserts[item._id]) {
        // Only safely remove upsert if item is unchanged
        if (_.isEqual(item, this.upserts[item._id])) {
          this._deleteUpsert(item._id)
        }
      }
    }
    if (success != null) {
      return success()
    }
  }

  resolveRemove(id: any, success: any) {
    this._deleteRemove(id)
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite or record as upsert
  seed(doc: any, success: any) {
    if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
      this._putItem(doc)
    }
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc: any, success: any) {
    if (!_.has(this.upserts, doc._id) && !_.has(this.removes, doc._id)) {
      const existing = this.items[doc._id]

      // If _rev present, make sure that not overwritten by lower _rev
      if (!existing || !doc._rev || !existing._rev || doc._rev >= existing._rev) {
        this._putItem(doc)
      }
    }
    if (success != null) {
      return success()
    }
  }
}
