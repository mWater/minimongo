import _ from "lodash"
import { processFind } from "./utils"
import * as utils from "./utils"
import { Doc, Item, MinimongoBaseCollection, MinimongoCollection, MinimongoCollectionFindOneOptions, MinimongoDb, MinimongoLocalCollection } from "./types"

/** Bridges a local and remote database, querying from the local first and then
 * getting the remote. Also uploads changes from local to remote.
 */
export default class HybridDb implements MinimongoDb {
  localDb: MinimongoDb
  remoteDb: MinimongoDb
  collections: { [collectionName: string]: HybridCollection<any> }

  constructor(localDb: MinimongoDb, remoteDb: MinimongoDb) {
    this.localDb = localDb
    this.remoteDb = remoteDb
    this.collections = {}
  }

  addCollection(name: any, options?: any, success?: any, error?: any) {
    // Shift options over if not present
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    const collection = new HybridCollection(name, this.localDb![name], this.remoteDb![name], options)
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

  upload(success: any, error: any) {
    const cols = Object.values(this.collections)

    function uploadCols(cols: HybridCollection<any>[], success: any, error: any) {
      const col = _.first(cols)
      if (col) {
        col.upload(
          () => uploadCols(_.tail(cols), success, error),
          (err: any) => error(err)
        )
      } else {
        success()
      }
    }

    return uploadCols(cols, success, error)
  }

  getCollectionNames() {
    return _.keys(this.collections)
  }
}

export class HybridCollection<T extends Doc> implements MinimongoBaseCollection<T> {
  name: string
  localCol: MinimongoLocalCollection<any>
  remoteCol: MinimongoCollection<any>
  options: any

  // Options includes
  constructor(name: string, localCol: MinimongoLocalCollection<T>, remoteCol: MinimongoCollection<T>, options: any) {
    this.name = name
    this.localCol = localCol
    this.remoteCol = remoteCol

    // Default options
    this.options = options || {}
    _.defaults(this.options, {
      cacheFind: true, // Cache find results in local db
      cacheFindOne: true, // Cache findOne results in local db
      interim: true, // Return interim results from local db while waiting for remote db. Return again if different
      useLocalOnRemoteError: true, // Use local results if the remote find fails. Only applies if interim is false.
      shortcut: false, // true to return `findOne` results if any matching result is found in the local database. Useful for documents that change rarely.
      timeout: 0, // Set to ms to timeout in for remote calls
      sortUpserts: null // Compare function to sort upserts sent to server
    })
  }

  find(selector: any, options = {}) {
    return {
      fetch: (success: any, error: any) => {
        return this._findFetch(selector, options, success, error)
      }
    }
  }

  // Finds one row.
  findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (item: T | null) => void, error: (err: any) => void): void
  findOne(selector: any, success: (item: T | null) => void, error: (err: any) => void): void
  findOne(selector: any, options: any, success: any, error?: any) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    // Merge options
    _.defaults(options, this.options)

    // Happens after initial find
    const step2 = (localDoc: any) => {
      const findOptions = _.cloneDeep(options)
      findOptions.interim = false
      findOptions.cacheFind = options.cacheFindOne
      if (selector._id) {
        findOptions.limit = 1
      } else {
        // Without _id specified, interaction between local and remote changes is complex
        // For example, if the one result returned by remote is locally deleted, we have no fallback
        // So instead we do a find with no limit and then take the first result, which is very inefficient
        delete findOptions.limit
      }

      return this.find(selector, findOptions).fetch(function (data: any) {
        // Return first entry or null
        if (data.length > 0) {
          // Check that different from existing
          if (!_.isEqual(localDoc, data[0])) {
            return success(data[0])
          }
        } else {
          // If nothing found, always report it, as interim find doesn't return null
          return success(null)
        }
      }, error)
    }

    // If interim or shortcut, get local first
    if (options.interim || options.shortcut) {
      return this.localCol.findOne(
        selector,
        options,
        function (localDoc: any) {
          // If found, return
          if (localDoc) {
            success(_.cloneDeep(localDoc))

            // If shortcut, we're done
            if (options.shortcut) {
              return
            }
          }
          return step2(localDoc)
        },
        error
      )
    } else {
      return step2(null)
    }
  }

  _findFetch(selector: any, options: any, success: any, error: any) {
    // Merge options
    _.defaults(options, this.options)

    // Get pending removes and upserts immediately to avoid odd race conditions
    return this.localCol.pendingUpserts!((upserts: any) => {
      return this.localCol.pendingRemoves!((removes: any) => {
        const step2 = (localData: any) => {
          // Setup remote options
          const remoteOptions = _.cloneDeep(options)

          // If caching, get all fields
          if (options.cacheFind) {
            delete remoteOptions.fields
          }

          // Add localData to options for remote find for quickfind protocol
          remoteOptions.localData = localData

          // Setup timer variables
          let timer: any = null
          let timedOut = false

          const remoteSuccess = (remoteData: any) => {
            // Cancel timer
            if (timer) {
              clearTimeout(timer)
            }

            // Ignore if timed out, caching asynchronously
            if (timedOut) {
              if (options.cacheFind) {
                this.localCol.cache(remoteData, selector, options, function () {}, error)
              }
              return
            }

            if (options.cacheFind) {
              // Cache locally
              const cacheSuccess = () => {
                // Get local data again
                function localSuccess2(localData2: any) {
                  // Check if different or not interim
                  if (!options.interim || !_.isEqual(localData, localData2)) {
                    // Send again
                    return success(localData2)
                  }
                }

                return this.localCol.find(selector, options).fetch(localSuccess2, error)
              }

              // Exclude any recent upserts/removes to prevent race condition
              const cacheOptions = _.extend({}, options, {
                exclude: removes.concat(_.map(upserts, (u: any) => u.doc._id))
              })
              return this.localCol.cache(remoteData, selector, cacheOptions, cacheSuccess, error)
            } else {
              // Remove local remotes
              let data = remoteData

              if (removes.length > 0) {
                const removesMap = _.fromPairs(_.map(removes, (id: any) => [id, id]))
                data = _.filter(remoteData, (doc: any) => !_.has(removesMap, doc._id))
              }

              // Add upserts
              if (upserts.length > 0) {
                // Remove upserts from data
                const upsertsMap = _.fromPairs(_.zip(
                    _.map(upserts, (u: any) => u.doc._id),
                    _.map(upserts, (u: any) => u.doc._id))
                    )
                data = _.filter(data, (doc: any) => !_.has(upsertsMap, doc._id))

                // Add upserts
                data = data.concat(_.map(upserts, "doc"))

                // Refilter/sort/limit
                data = processFind(data, selector, options)
              }

              // Check if different or not interim
              if (!options.interim || !_.isEqual(localData, data)) {
                // Send again
                return success(data)
              }
            }
          }

          const remoteError = (err: any) => {
            // Cancel timer
            if (timer) {
              clearTimeout(timer)
            }

            if (timedOut) {
              return
            }

            // If no interim, do local find
            if (!options.interim) {
              if (options.useLocalOnRemoteError) {
                return success(localData)
              } else {
                if (error) {
                  return error(err)
                }
              }
            } else {
              // Otherwise do nothing
              return
            }
          }

          // Start timer if remote
          if (options.timeout) {
            timer = setTimeout(() => {
              timer = null
              timedOut = true

              // If no interim, do local find
              if (!options.interim) {
                if (options.useLocalOnRemoteError) {
                  return this.localCol.find(selector, options).fetch(success, error)
                } else {
                  if (error) {
                    return error(new Error("Remote timed out"))
                  }
                }
              } else {
                // Otherwise do nothing
                return
              }
            }, options.timeout)
          }

          return this.remoteCol.find(selector, remoteOptions).fetch(remoteSuccess, remoteError)
        }

        function localSuccess(localData: any) {
          // If interim, return data immediately
          if (options.interim) {
            success(localData)
          }
          return step2(localData)
        }

        // Always get local data first
        return this.localCol.find(selector, options).fetch(localSuccess, error)
      }, error)
    }, error)
  }

  upsert(doc: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(doc: T, base: T, success: (doc: T | null) => void, error: (err: any) => void): void
  upsert(docs: T[], success: (docs: (T | null)[]) => void, error: (err: any) => void): void
  upsert(docs: T[], bases: T[], success: (item: T | null) => void, error: (err: any) => void): void
  upsert(docs: any, bases: any, success: any, error?: any): void 
  {
    let items
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    return this.localCol.upsert(_.map(items, "doc"), _.map(items, "base"), (result: any) => success?.(docs), error)
  }

  remove(id: any, success: () => void, error: (err: any) => void) {
    return this.localCol.remove(
      id,
      function () {
        if (success != null) {
          return success()
        }
      },
      error
    )
  }

  upload(success: () => void, error: (err: any) => void) {
    const uploadUpserts = (upserts: Item<T>[], success: () => void, error: (err: any) => void): void => {
      const upsert = _.first(upserts)
      if (upsert) {
        return this.remoteCol.upsert(
          upsert.doc,
          upsert.base,
          (remoteDoc: any) => {
            return this.localCol.resolveUpserts(
              [upsert],
              () => {
                // Cache new value if present
                if (remoteDoc) {
                  return this.localCol.cacheOne(remoteDoc, () => uploadUpserts(_.tail(upserts), success, error), error)
                } else {
                  // Remove local
                  return this.localCol.remove(
                    upsert.doc._id!,
                    () => {
                      // Resolve remove
                      return this.localCol.resolveRemove(
                        upsert.doc._id!,
                        () => uploadUpserts(_.tail(upserts), success, error),
                        error
                      )
                    },
                    error
                  )
                }
              },
              error
            )
          },
          (err: any) => {
            // If 410 error or 403, remove document
            if (err.status === 410 || err.status === 403) {
              return this.localCol.remove(
                upsert.doc._id!,
                () => {
                  // Resolve remove
                  return this.localCol.resolveRemove(
                    upsert.doc._id!,
                    function () {
                      // Continue if was 410
                      if (err.status === 410) {
                        return uploadUpserts(_.tail(upserts), success, error)
                      } else {
                        return error(err)
                      }
                    },
                    error
                  )
                },
                error
              )
            } else {
              return error(err)
            }
          }
        )
      } else {
        return success()
      }
    }

    const uploadRemoves = (removes: string[], success: () => void, error: (error: any) => void): void => {
      const remove = _.first(removes)
      if (remove) {
        return this.remoteCol.remove(
          remove,
          () => {
            return this.localCol.resolveRemove(remove, () => uploadRemoves(_.tail(removes), success, error), error)
          },
          (err: any) => {
            // If 403 or 410, remove document
            if (err.status === 410 || err.status === 403) {
              return this.localCol.resolveRemove(
                remove,
                function () {
                  // Continue if was 410
                  if (err.status === 410) {
                    return uploadRemoves(_.tail(removes), success, error)
                  } else {
                    return error(err)
                  }
                },
                error
              )
            } else {
              return error(err)
            }
          }
        )
      } else {
        success()
      }
    }

    // Get pending upserts
    this.localCol.pendingUpserts((upserts: any) => {
      // Sort upserts if sort defined
      if (this.options.sortUpserts) {
        upserts.sort((u1: any, u2: any) => this.options.sortUpserts(u1.doc, u2.doc))
      }

      return uploadUpserts(
        upserts,
        () => {
          return this.localCol.pendingRemoves((removes: any) => uploadRemoves(removes, success, error), error)
        },
        error
      )
    }, error)
  }
}
