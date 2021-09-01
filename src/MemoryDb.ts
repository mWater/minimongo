// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let MemoryDb
import _ from "lodash"
import async from "async"
import * as utils from "./utils"
import { processFind } from "./utils"
import { compileSort } from "./selector"

export default MemoryDb = class MemoryDb {
  // Options are:
  //  safety: How to protect the in-memory copies: "clone" (default) returns a fresh copy but is slow. "freeze" returns a frozen version
  constructor(options, success) {
    this.collections = {}
    this.options = _.defaults(options, { safety: "clone" })

    if (success) {
      success(this)
    }
  }

  addCollection(name, success, error) {
    const collection = new Collection(name, this.options)
    this[name] = collection
    this.collections[name] = collection
    if (success != null) {
      return success()
    }
  }

  removeCollection(name, success, error) {
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

// Stores data in memory
class Collection {
  constructor(name, options) {
    this.name = name

    this.items = {}
    this.upserts = {} // Pending upserts by _id. Still in items
    this.removes = {} // Pending removes by _id. No longer in items
    this.options = options || {}
  }

  find(selector, options) {
    return {
      fetch: (success, error) => {
        return this._findFetch(selector, options, success, error)
      }
    }
  }

  findOne(selector, options, success, error) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    return this.find(selector, options).fetch((results) => {
      if (success != null) {
        return success(this._applySafety(results.length > 0 ? results[0] : null))
      }
    }, error)
  }

  _findFetch(selector, options, success, error) {
    // Defer to allow other processes to run
    return setTimeout(() => {
      // Shortcut if _id is specified
      let allItems
      if (selector && selector._id && _.isString(selector._id)) {
        allItems = _.compact([this.items[selector._id]])
      } else {
        allItems = _.values(this.items)
      }
      const results = processFind(allItems, selector, options)
      if (success != null) {
        return success(this._applySafety(results))
      }
    }, 0)
  }

  // Applies safety (either freezing or cloning to object or array)
  _applySafety = (items) => {
    if (!items) {
      return items
    }
    if (_.isArray(items)) {
      return _.map(items, this._applySafety)
    }
    if (this.options.safety === "clone" || !this.options.safety) {
      return JSON.parse(JSON.stringify(items))
    }
    if (this.options.safety === "freeze") {
      Object.freeze(items)
      return items
    }

    throw new Error(`Unsupported safety ${this.options.safety}`)
  }

  upsert(docs, bases, success, error) {
    let items
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    // Keep independent copies to prevent modification
    items = JSON.parse(JSON.stringify(items))

    for (let item of items) {
      // Fill in base if undefined
      if (item.base === undefined) {
        // Use existing base
        if (this.upserts[item.doc._id]) {
          item.base = this.upserts[item.doc._id].base
        } else {
          item.base = this.items[item.doc._id] || null
        }
      }

      // Replace/add
      this.items[item.doc._id] = item.doc
      this.upserts[item.doc._id] = item
    }

    if (_.isArray(docs)) {
      if (success) {
        return success(this._applySafety(_.pluck(items, "doc")))
      }
    } else {
      if (success) {
        return success(this._applySafety(_.pluck(items, "doc")[0]))
      }
    }
  }

  remove(id, success, error) {
    // Special case for filter-type remove
    if (_.isObject(id)) {
      this.find(id).fetch((rows) => {
        return async.each(
          rows,
          (row, cb) => {
            return this.remove(row._id, () => cb(), cb)
          },
          () => success()
        )
      }, error)
      return
    }

    if (_.has(this.items, id)) {
      this.removes[id] = this.items[id]
      delete this.items[id]
      delete this.upserts[id]
    } else {
      this.removes[id] = { _id: id }
    }

    if (success != null) {
      return success()
    }
  }

  // Options are find options with optional "exclude" which is list of _ids to exclude
  cache(docs, selector, options, success, error) {
    // Add all non-local that are not upserted or removed
    let sort
    for (let doc of docs) {
      // Exclude any excluded _ids from being cached/uncached
      if (options && options.exclude && options.exclude.includes(doc._id)) {
        continue
      }

      this.cacheOne(doc)
    }

    const docsMap = _.object(_.pluck(docs, "_id"), docs)

    if (options.sort) {
      sort = compileSort(options.sort)
    }

    // Perform query, removing rows missing in docs from local db
    return this.find(selector, options).fetch((results) => {
      for (let result of results) {
        if (!docsMap[result._id] && !_.has(this.upserts, result._id)) {
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

          // Exclude any excluded _ids from being cached/uncached
          if (options && options.exclude && options.exclude.includes(result._id)) {
            continue
          }

          delete this.items[result._id]
        }
      }

      if (success != null) {
        return success()
      }
    }, error)
  }

  pendingUpserts(success) {
    return success(_.values(this.upserts))
  }

  pendingRemoves(success) {
    return success(_.pluck(this.removes, "_id"))
  }

  resolveUpserts(upserts, success) {
    for (let upsert of upserts) {
      const id = upsert.doc._id
      if (this.upserts[id]) {
        // Only safely remove upsert if doc is unchanged
        if (_.isEqual(upsert.doc, this.upserts[id].doc)) {
          delete this.upserts[id]
        } else {
          // Just update base
          this.upserts[id].base = upsert.doc
        }
      }
    }

    if (success != null) {
      return success()
    }
  }

  resolveRemove(id, success) {
    delete this.removes[id]
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite or record as upsert
  seed(docs, success) {
    if (!_.isArray(docs)) {
      docs = [docs]
    }

    for (let doc of docs) {
      if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
        this.items[doc._id] = doc
      }
    }
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc, success, error) {
    return this.cacheList([doc], success, error)
  }

  // Add but do not overwrite upserts or removes
  cacheList(docs, success) {
    for (let doc of docs) {
      if (!_.has(this.upserts, doc._id) && !_.has(this.removes, doc._id)) {
        const existing = this.items[doc._id]

        // If _rev present, make sure that not overwritten by lower or equal _rev
        if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
          this.items[doc._id] = doc
        }
      }
    }

    if (success != null) {
      return success()
    }
  }

  uncache(selector, success, error) {
    const compiledSelector = utils.compileDocumentSelector(selector)

    const items = _.filter(_.values(this.items), (item) => {
      return this.upserts[item._id] != null || !compiledSelector(item)
    })

    this.items = _.object(_.pluck(items, "_id"), items)
    if (success != null) {
      return success()
    }
  }

  uncacheList(ids, success, error) {
    const idIndex = _.indexBy(ids)

    const items = _.filter(_.values(this.items), (item) => {
      return this.upserts[item._id] != null || !idIndex[item._id]
    })

    this.items = _.object(_.pluck(items, "_id"), items)
    if (success != null) {
      return success()
    }
  }
}
