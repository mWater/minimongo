import _ from "lodash"
import async from "async"
import * as utils from "./utils"
import { processFind } from "./utils"
import { compileSort } from "./selector"
import { Doc, MinimongoCollection, MinimongoCollectionFindOptions, MinimongoDb } from "./types"
import { Item, MinimongoLocalCollection } from "."

export default class LocalStorageDb implements MinimongoDb {
  collections: { [collectionName: string]: MinimongoCollection<any> }
  namespace: string

  constructor(options: any, success: any, error?: any) {
    this.collections = {}

    if (options && options.namespace && window.localStorage) {
      this.namespace = options.namespace
    }

    if (success) {
      success(this)
    }
  }

  addCollection(name: string, success: any, error: any) {
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
        keys.push(window.localStorage.key(i)!)
      }

      for (let key of keys) {
        const keyToMatch = this.namespace + "." + name
        if (key.substring(0, keyToMatch.length) === keyToMatch) {
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

  getCollectionNames() {
    return _.keys(this.collections)
  }
}

// Stores data in memory, optionally backed by local storage
class Collection<T extends Doc> implements MinimongoLocalCollection<T> {
  name: string
  namespace: string | undefined
  items: { [id: string]: T }
  upserts: { [id: string]: Item<T> }
  removes: { [id: string]: T }
  itemNamespace: string

  constructor(name: string, namespace?: string) {
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
      key = window.localStorage.key(i)!
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
      this.upserts[key] = { doc: this.items[key] }
      // Get base if present
      const base = window.localStorage[this.namespace + "upsertbase_" + key]
        ? JSON.parse(window.localStorage[this.namespace + "upsertbase_" + key])
        : null
      this.upserts[key].base = base
    }

    // Read removes
    const removeItems = window.localStorage[this.namespace + "removes"]
      ? JSON.parse(window.localStorage[this.namespace + "removes"])
      : []
    return (this.removes = _.fromPairs(_.zip(_.map(removeItems, "_id"), removeItems)))
  }

  find(selector: any, options?: MinimongoCollectionFindOptions) {
    return {
      fetch: (success: any, error: any) => {
        return this._findFetch(selector, options, success, error)
      }
    }
  }

  findOne(selector: any, options: any, success: any, error?: any) {
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
    // Deep clone to prevent modification
    if (success != null) {
      return success(processFind(_.cloneDeep(_.values(this.items)), selector, options))
    }
  }

  upsert(doc: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(doc: T, base: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(docs: T[], success: (docs: (T | null)[]) => void, error: (err: any) => void): void
  upsert(docs: T[], bases: T[], success: (item: T | null) => void, error: (err: any) => void): void
  upsert(docs: any, bases: any, success: any, error?: any) {
    let items
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    // Keep independent copies to prevent modification
    items = JSON.parse(JSON.stringify(items))

    for (let item of items) {
      // Fill in base
      if (item.base === undefined) {
        // Use existing base
        if (this.upserts[item.doc._id]) {
          item.base = this.upserts[item.doc._id].base
        } else {
          item.base = this.items[item.doc._id] || null
        }
      }

      // Keep independent copies
      item = _.cloneDeep(item)

      // Replace/add
      this._putItem(item.doc)
      this._putUpsert(item)
    }

    if (success) {
      return success(docs)
    }
  }

  remove(id: any, success: any, error: any) {
    // Special case for filter-type remove
    if (_.isObject(id)) {
      this.find(id).fetch((rows: any) => {
        return async.each(
          rows,
          ((row: any, cb: any) => {
            return this.remove(row._id, () => cb(), cb)
          }) as any,
          () => success()
        )
      }, error)
      return
    }

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

  _putItem(doc: T) {
    this.items[doc._id!] = doc
    if (this.namespace) {
      window.localStorage[this.itemNamespace + doc._id] = JSON.stringify(doc)
    }
  }

  _deleteItem(id: any) {
    delete this.items[id]
    if (this.namespace) {
      window.localStorage.removeItem(this.itemNamespace + id)
    }
  }

  _putUpsert(upsert: any) {
    this.upserts[upsert.doc._id] = upsert
    if (this.namespace) {
      window.localStorage[this.namespace + "upserts"] = JSON.stringify(_.keys(this.upserts))
      window.localStorage[this.namespace + "upsertbase_" + upsert.doc._id] = JSON.stringify(upsert.base)
    }
  }

  _deleteUpsert(id: any) {
    delete this.upserts[id]
    if (this.namespace) {
      window.localStorage[this.namespace + "upserts"] = JSON.stringify(_.keys(this.upserts))
    }
  }

  _putRemove(doc: any) {
    this.removes[doc._id] = doc
    if (this.namespace) {
      window.localStorage[this.namespace + "removes"] = JSON.stringify(_.values(this.removes))
    }
  }

  _deleteRemove(id: any) {
    delete this.removes[id]
    if (this.namespace) {
      window.localStorage[this.namespace + "removes"] = JSON.stringify(_.values(this.removes))
    }
  }

  cache(docs: any, selector: any, options: any, success: any, error: any) {
    // Add all non-local that are not upserted or removed
    let sort: any
    for (let doc of docs) {
      // Exclude any excluded _ids from being cached/uncached
      if (options && options.exclude && options.exclude.includes(doc._id)) {
        continue
      }

      this.cacheOne(doc, () => {}, () => {})
    }

    const docsMap = _.fromPairs(_.zip(_.map(docs, "_id"), docs))

    if (options.sort) {
      sort = compileSort(options.sort)
    }

    // Perform query, removing rows missing in docs from local db
    return this.find(selector, options).fetch((results: any) => {
      for (let result of results) {
        if (!docsMap[result._id] && !_.has(this.upserts, result._id)) {
          // Exclude any excluded _ids from being cached/uncached
          if (options && options.exclude && options.exclude.includes(result._id)) {
            continue
          }

          // If at limit
          if (options.limit && docs.length === options.limit) {
            // If past end on sorted limited, ignore
            if (options.sort && sort(result, _.last(docs)) >= 0) {
              continue
            }
            // If no sort, ignore
            if (!options.sort) {
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

  resolveUpserts(upserts: any, success: any) {
    for (let upsert of upserts) {
      if (this.upserts[upsert.doc._id]) {
        // Only safely remove upsert if item is unchanged
        if (_.isEqual(upsert.doc, this.upserts[upsert.doc._id].doc)) {
          this._deleteUpsert(upsert.doc._id)
        } else {
          // Just update base
          this.upserts[upsert.doc._id].base = upsert.doc
          this._putUpsert(this.upserts[upsert.doc._id])
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
  seed(docs: any, success: any) {
    if (!_.isArray(docs)) {
      docs = [docs]
    }

    for (let doc of docs) {
      if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
        this._putItem(doc)
      }
    }
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc: any, success: any, error: any) {
    return this.cacheList([doc], success, error)
  }

  // Add but do not overwrite upserts or removes
  cacheList(docs: any, success: any, error: any) {
    for (let doc of docs) {
      if (!_.has(this.upserts, doc._id) && !_.has(this.removes, doc._id)) {
        const existing = this.items[doc._id]

        // If _rev present, make sure that not overwritten by lower or equal _rev
        if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
          this._putItem(doc)
        }
      }
    }
    if (success != null) {
      return success()
    }
  }

  uncache(selector: any, success: any, error: any) {
    const compiledSelector = utils.compileDocumentSelector(selector)

    for (let item of _.values(this.items)) {
      if (this.upserts[item._id!] == null && compiledSelector(item)) {
        this._deleteItem(item._id)
      }
    }

    if (success != null) {
      return success()
    }
  }

  uncacheList(ids: any, success: any, error: any) {
    for (let id of ids) {
      if (this.upserts[id] == null) {
        this._deleteItem(id)
      }
    }

    if (success != null) {
      return success()
    }
  }
}
