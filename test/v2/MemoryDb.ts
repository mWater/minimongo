// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let MemoryDb
import _ from "lodash"
import { createUid, processFind } from "./utils";
import { compileSort } from "./selector"

export default MemoryDb = class MemoryDb {
  constructor(options: any, success: any) {
    this.collections = {}

    if (success) {
      success(this)
    }
  }

  addCollection(name: any, success: any, error: any) {
    const collection = new Collection(name)
    this[name] = collection
    this.collections[name] = collection
    if (success != null) {
      return success()
    }
  }

  removeCollection(name: any, success: any, error: any) {
    delete this[name]
    delete this.collections[name]
    if (success != null) {
      return success()
    }
  }
}

// Stores data in memory
class Collection {
  constructor(name: any) {
    this.name = name

    this.items = {}
    this.upserts = {} // Pending upserts by _id. Still in items
    this.removes = {} // Pending removes by _id. No longer in items
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

    for (let item of items) {
      if (!item._id) {
        item._id = createUid()
      }

      // Replace/add
      this.items[item._id] = item
      this.upserts[item._id] = item
    }

    if (success) {
      return success(doc)
    }
  }

  remove(id: any, success: any, error: any) {
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
          delete this.items[result._id]
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
        // Only safely remove upsert if doc is unchanged
        if (_.isEqual(item, this.upserts[item._id])) {
          delete this.upserts[item._id]
        }
      }
    }
    if (success != null) {
      return success()
    }
  }

  resolveRemove(id: any, success: any) {
    delete this.removes[id]
    if (success != null) {
      return success()
    }
  }

  // Add but do not overwrite or record as upsert
  seed(doc: any, success: any) {
    if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
      this.items[doc._id] = doc
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
        this.items[doc._id] = doc
      }
    }
    if (success != null) {
      return success()
    }
  }
}
