// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

*/

let HybridDb
import _ from "lodash"
import { processFind } from "./utils"

export default HybridDb = class HybridDb {
  constructor(localDb: any, remoteDb: any) {
    this.localDb = localDb
    this.remoteDb = remoteDb
    this.collections = {}
  }

  addCollection(name: any, options: any, success: any, error: any) {
    // Shift options over if not present
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    const collection = new HybridCollection(name, this.localDb[name], this.remoteDb[name], options)
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
    const cols = _.values(this.collections)

    function uploadCols(cols: any, success: any, error: any) {
      const col = _.first(cols)
      if (col) {
        return col.upload(
          () => uploadCols(_.tail(cols), success, error),
          (err: any) => error(err)
        )
      } else {
        return success()
      }
    }

    return uploadCols(cols, success, error)
  }
}

class HybridCollection {
  // Options includes
  constructor(name: any, localCol: any, remoteCol: any, options: any) {
    this.name = name
    this.localCol = localCol
    this.remoteCol = remoteCol

    // Default options
    options = options || {}
    _.defaults(options, { caching: true })

    // Extract options
    this.caching = options.caching
  }

  // options.mode defaults to "hybrid" (unless caching=false, in which case "remote")
  // In "hybrid", it will return local results, then hit remote and return again if different
  // If remote gives error, it will be ignored
  // In "remote", it will call remote and not cache, but integrates local upserts/deletes
  // If remote gives error, then it will return local results
  // In "local", just returns local results
  find(selector: any, options = {}) {
    return {
      fetch: (success: any, error: any) => {
        return this._findFetch(selector, options, success, error)
      }
    }
  }

  // options.mode defaults to "hybrid".
  // In "hybrid", it will return local if present, otherwise fall to remote without returning null
  // If remote gives error, then it will return null if none locally. If remote and local differ, it
  // will return twice
  // In "local", it will return local if present. If not present, only then will it hit remote.
  // If remote gives error, then it will return null
  // In "remote", it gets remote and integrates local changes. Much more efficient if _id specified
  // If remote gives error, falls back to local if caching
  findOne(selector: any, options = {}, success: any, error: any) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    const mode = options.mode || (this.caching ? "hybrid" : "remote")

    if (mode === "hybrid" || mode === "local") {
      options.limit = 1
      return this.localCol.findOne(
        selector,
        options,
        (localDoc: any) => {
          // If found, return
          if (localDoc) {
            success(localDoc)
            // No need to hit remote if local
            if (mode === "local") {
              return
            }
          }

          const remoteSuccess = (remoteDoc: any) => {
            // Cache
            const cacheSuccess = () => {
              // Try query again
              return this.localCol.findOne(selector, options, function (localDoc2: any) {
                if (!_.isEqual(localDoc, localDoc2)) {
                  return success(localDoc2)
                } else if (!localDoc) {
                  return success(null)
                }
              })
            }

            const docs = remoteDoc ? [remoteDoc] : []
            return this.localCol.cache(docs, selector, options, cacheSuccess, error)
          }

          function remoteError() {
            // Remote errored out. Return null if local did not return
            if (!localDoc) {
              return success(null)
            }
          }

          // Call remote
          return this.remoteCol.findOne(selector, _.omit(options, "fields"), remoteSuccess, remoteError)
        },
        error
      )
    } else if (mode === "remote") {
      // If _id specified, use remote findOne
      if (selector._id) {
        const remoteSuccess2 = (remoteData: any) => {
          // Check for local upsert
          return this.localCol.pendingUpserts((pendingUpserts: any) => {
            const localData = _.find(pendingUpserts, { _id: selector._id })
            if (localData) {
              return success(localData)
            }

            // Check for local remove
            return this.localCol.pendingRemoves(function (pendingRemoves: any) {
              if (pendingRemoves.includes(selector._id)) {
                // Removed, success null
                return success(null)
              }

              return success(remoteData)
            })
          }, error)
        }

        // Get remote response
        return this.remoteCol.findOne(selector, options, remoteSuccess2, error)
      } else {
        // Without _id specified, interaction between local and remote changes is complex
        // For example, if the one result returned by remote is locally deleted, we have no fallback
        // So instead we do a normal find and then take the first result, which is very inefficient
        return this.find(selector, options).fetch(
          function (findData: any) {
            if (findData.length > 0) {
              return success(findData[0])
            } else {
              return success(null)
            }
          },
          (err: any) => {
            // Call local if caching
            if (this.caching) {
              return this.localCol.findOne(selector, options, success, error)
            } else {
              // Otherwise bubble up
              if (error) {
                return error(err)
              }
            }
          }
        )
      }
    } else {
      throw new Error("Unknown mode")
    }
  }

  _findFetch(selector: any, options: any, success: any, error: any) {
    const mode = options.mode || (this.caching ? "hybrid" : "remote")

    if (mode === "hybrid") {
      // Get local results
      const localSuccess = (localData: any) => {
        // Return data immediately
        success(localData)

        // Get remote data
        const remoteSuccess = (remoteData: any) => {
          // Cache locally
          const cacheSuccess = () => {
            // Get local data again
            function localSuccess2(localData2: any) {
              // Check if different
              if (!_.isEqual(localData, localData2)) {
                // Send again
                return success(localData2)
              }
            }

            return this.localCol.find(selector, options).fetch(localSuccess2, error)
          }
          return this.localCol.cache(remoteData, selector, options, cacheSuccess, error)
        }
        return this.remoteCol.find(selector, _.omit(options, "fields")).fetch(remoteSuccess)
      }

      return this.localCol.find(selector, options).fetch(localSuccess, error)
    } else if (mode === "local") {
      return this.localCol.find(selector, options).fetch(success, error)
    } else if (mode === "remote") {
      // Get remote results
      const remoteSuccess = (remoteData: any) => {
        // Remove local remotes
        let data = remoteData

        return this.localCol.pendingRemoves((removes: any) => {
          if (removes.length > 0) {
            const removesMap = _.fromPairs(_.map(removes, (id: any) => [id, id]))
            data = _.filter(remoteData, (doc: any) => !_.has(removesMap, doc._id))
          }

          // Add upserts
          return this.localCol.pendingUpserts(function (upserts: any) {
            if (upserts.length > 0) {
              // Remove upserts from data
              const upsertsMap = _.fromPairs(_.zip(_.map(upserts, "_id"), _.map(upserts, "_id")))
              data = _.filter(data, (doc: any) => !_.has(upsertsMap, doc._id))

              // Add upserts
              data = data.concat(upserts)

              // Refilter/sort/limit
              data = processFind(data, selector, options)
            }

            return success(data)
          })
        })
      }

      const remoteError = (err: any) => {
        // Call local if caching
        if (this.caching) {
          return this.localCol.find(selector, options).fetch(success, error)
        } else {
          // Otherwise bubble up
          if (error) {
            return error(err)
          }
        }
      }

      return this.remoteCol.find(selector, options).fetch(remoteSuccess, remoteError)
    } else {
      throw new Error("Unknown mode")
    }
  }

  upsert(doc: any, success: any, error: any) {
    return this.localCol.upsert(
      doc,
      function (result: any) {
        if (success != null) {
          return success(result)
        }
      },
      error
    )
  }

  remove(id: any, success: any, error: any) {
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

  upload(success: any, error: any) {
    var uploadUpserts = (upserts: any, success: any, error: any) => {
      const upsert = _.first(upserts)
      if (upsert) {
        return this.remoteCol.upsert(
          upsert,
          (remoteDoc: any) => {
            return this.localCol.resolveUpsert(
              upsert,
              () => {
                // Cache new value if caching
                if (this.caching) {
                  return this.localCol.cacheOne(remoteDoc, () => uploadUpserts(_.tail(upserts), success, error), error)
                } else {
                  // Remove document
                  return this.localCol.remove(
                    upsert._id,
                    () => {
                      // Resolve remove
                      return this.localCol.resolveRemove(
                        upsert._id,
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
                upsert._id,
                () => {
                  // Resolve remove
                  return this.localCol.resolveRemove(
                    upsert._id,
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

    var uploadRemoves = (removes: any, success: any, error: any) => {
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
          },
          error
        )
      } else {
        return success()
      }
    }

    // Get pending upserts
    return this.localCol.pendingUpserts((upserts: any) => {
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
