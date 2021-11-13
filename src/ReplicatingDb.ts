import _ from "lodash"
import * as utils from "./utils"
import { compileSort } from "./selector"
import { Doc, MinimongoCollection, MinimongoDb, MinimongoLocalCollection, MinimongoLocalDb } from "./types"

/** Replicates data into a both a master and a replica db. Assumes both are identical at start
 * and then only uses master for finds and does all changes to both
 * Warning: removing a collection removes it from the underlying master and replica!
 */
export default class ReplicatingDb implements MinimongoLocalDb {
  collections: { [collectionName: string]: Collection<any> }
  masterDb: MinimongoDb
  replicaDb: MinimongoDb

  constructor(masterDb: MinimongoDb, replicaDb: MinimongoDb) {
    this.collections = {}

    this.masterDb = masterDb
    this.replicaDb = replicaDb
  }

  addCollection(name: any, success: any, error: any) {
    const collection = new Collection(name, this.masterDb[name], this.replicaDb[name])
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

  getCollectionNames() {
    return _.keys(this.collections)
  }
}

// Replicated collection.
class Collection<T extends Doc> implements MinimongoLocalCollection<T> {
  name: string
  masterCol: MinimongoLocalCollection<T>
  replicaCol: MinimongoLocalCollection<T>

  constructor(name: string, masterCol: MinimongoLocalCollection, replicaCol: MinimongoLocalCollection) {
    this.name = name
    this.masterCol = masterCol
    this.replicaCol = replicaCol
  }

  find(selector: any, options: any) {
    return this.masterCol.find(selector, options)
  }

  findOne(selector: any, options: any, success: any, error?: any) {
    return this.masterCol.findOne(selector, options, success, error)
  }

  upsert(docs: any, bases: any, success: any, error?: any) {
    let items: any
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    // Upsert does to both
    return this.masterCol.upsert(
      _.map(items, "doc"),
      _.map(items, "base"),
      () => {
        return this.replicaCol.upsert(
          _.map(items, "doc"),
          _.map(items, "base"),
          (results: any) => {
            return success(docs)
          },
          error
        )
      },
      error
    )
  }

  remove(id: any, success: any, error: any) {
    // Do to both
    this.masterCol.remove(
      id,
      () => {
        this.replicaCol.remove(id, success, error)
      },
      error
    )
  }

  cache(docs: any, selector: any, options: any, success: any, error: any) {
    // Calculate what has to be done for cache using the master database which is faster (usually MemoryDb)
    // then do minimum to both databases

    // Index docs
    let sort: any
    const docsMap = _.keyBy(docs, "_id")

    // Compile sort
    if (options.sort) {
      sort = compileSort(options.sort)
    }

    // Perform query
    return this.masterCol.find(selector, options).fetch((results: any) => {
      let result
      const resultsMap = _.keyBy(results, "_id")

      // Determine if each result needs to be cached
      const toCache: any = []
      for (let doc of docs) {
        result = resultsMap[doc._id]

        // Exclude any excluded _ids from being cached/uncached
        if (options && options.exclude && options.exclude.includes(doc._id)) {
          continue
        }

        // If not present locally, cache it
        if (!result) {
          toCache.push(doc)
          continue
        }

        // If both have revisions (_rev) and new one is same or lower, do not cache
        if (doc._rev && result._rev && doc._rev <= result._rev) {
          continue
        }

        // Only cache if different
        if (!_.isEqual(doc, result)) {
          toCache.push(doc)
        }
      }

      const toUncache: any = []
      for (result of results) {
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

        // Determine which ones to uncache
        if (!docsMap[result._id]) {
          toUncache.push(result._id)
        }
      }

      // Cache ones needing caching
      const performCaches = (next: any) => {
        if (toCache.length > 0) {
          return this.masterCol.cacheList(
            toCache,
            () => {
              return this.replicaCol.cacheList(
                toCache,
                () => {
                  return next()
                },
                error
              )
            },
            error
          )
        } else {
          return next()
        }
      }

      // Uncache list
      const performUncaches = (next: any) => {
        if (toUncache.length > 0) {
          return this.masterCol.uncacheList(
            toUncache,
            () => {
              return this.replicaCol.uncacheList(
                toUncache,
                () => {
                  return next()
                },
                error
              )
            },
            error
          )
        } else {
          return next()
        }
      }

      return performCaches(() => {
        return performUncaches(() => {
          if (success != null) {
            success()
          }
        })
      })
    }, error)
  }

  pendingUpserts(success: any, error: any) {
    return this.masterCol.pendingUpserts(success, error)
  }

  pendingRemoves(success: any, error: any) {
    return this.masterCol.pendingRemoves(success, error)
  }

  resolveUpserts(upserts: any, success: any, error: any) {
    return this.masterCol.resolveUpserts(
      upserts,
      () => {
        return this.replicaCol.resolveUpserts(upserts, success, error)
      },
      error
    )
  }

  resolveRemove(id: any, success: any, error: any) {
    return this.masterCol.resolveRemove(
      id,
      () => {
        return this.replicaCol.resolveRemove(id, success, error)
      },
      error
    )
  }

  // Add but do not overwrite or record as upsert
  seed(docs: any, success: any, error: any) {
    return this.masterCol.seed(
      docs,
      () => {
        return this.replicaCol.seed(docs, success, error)
      },
      error
    )
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc: any, success: any, error: any) {
    return this.masterCol.cacheOne(
      doc,
      () => {
        return this.replicaCol.cacheOne(doc, success, error)
      },
      error
    )
  }

  // Add but do not overwrite upserts or removes
  cacheList(docs: any, success: any, error: any) {
    return this.masterCol.cacheList(
      docs,
      () => {
        return this.replicaCol.cacheList(docs, success, error)
      },
      error
    )
  }

  uncache(selector: any, success: any, error: any) {
    return this.masterCol.uncache(
      selector,
      () => {
        return this.replicaCol.uncache(selector, success, error)
      },
      error
    )
  }

  uncacheList(ids: any, success: any, error: any) {
    return this.masterCol.uncacheList(
      ids,
      () => {
        return this.replicaCol.uncacheList(ids, success, error)
      },
      error
    )
  }
}
