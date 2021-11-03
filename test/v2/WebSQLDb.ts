// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let WebSQLDb
import _ from "lodash"
import async from "async"
import { createUid, processFind } from "./utils";
import { compileSort } from "./selector"

// Do nothing callback for success
function doNothing() {}

export default WebSQLDb = class WebSQLDb {
  constructor(options: any, success: any, error: any) {
    this.collections = {}

    // Create database
    // TODO escape name
    this.db = window.openDatabase(
      "minimongo_" + options.namespace,
      "",
      "Minimongo:" + options.namespace,
      5 * 1024 * 1024
    )
    if (!this.db) {
      return error("Failed to create database")
    }

    const createTables = (tx: any) =>
      tx.executeSql(
        `\
CREATE TABLE IF NOT EXISTS docs (
col TEXT NOT NULL,
id TEXT NOT NULL,
state TEXT NOT NULL,
doc TEXT,
PRIMARY KEY (col, id));`,
        [],
        doNothing,
        error
      )

    // Create tables
    this.db.transaction(createTables, error, () => {
      if (success) {
        return success(this)
      }
    })
  }

  addCollection(name: any, success: any, error: any) {
    const collection = new Collection(name, this.db)
    this[name] = collection
    this.collections[name] = collection
    if (success) {
      return success()
    }
  }

  removeCollection(name: any, success: any, error: any) {
    delete this[name]
    delete this.collections[name]

    // Remove all documents of collection
    return this.db.transaction(
      (tx: any) => tx.executeSql("DELETE FROM docs WHERE col = ?", [name], success, error),
      error
    )
  }
}

// Stores data in indexeddb store
class Collection {
  constructor(name: any, db: any) {
    this.name = name
    this.db = db
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
    // Android 2.x requires error callback
    error = error || function () {}

    // Get all docs from collection
    return this.db.readTransaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ?",
        [this.name],
        function (tx: any, results: any) {
          const docs = []
          for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            const row = results.rows.item(i)
            if (row.state !== "removed") {
              docs.push(JSON.parse(row.doc))
            }
          }
          if (success != null) {
            return success(processFind(docs, selector, options))
          }
        },
        error
      )
    }, error)
  }

  upsert(doc: any, success: any, error: any) {
    // Android 2.x requires error callback
    let item
    error = error || function () {}

    // Handle both single and multiple upsert
    let items = doc
    if (!_.isArray(items)) {
      items = [items]
    }

    for (item of items) {
      if (!item._id) {
        item._id = createUid()
      }
    }

    return this.db.transaction(
      (tx: any) => {
        return (() => {
          const result = []
          for (item of items) {
            result.push(
              tx.executeSql(
                "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                [this.name, item._id, "upserted", JSON.stringify(item)],
                doNothing,
                error
              )
            )
          }
          return result
        })()
      },
      error,
      function () {
        if (success) {
          return success(doc)
        }
      }
    )
  }

  remove(id: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    // Find record
    return this.db.transaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND id = ?",
        [this.name, id],
        (tx: any, results: any) => {
          if (results.rows.length > 0) {
            // Change to removed
            return tx.executeSql(
              'UPDATE docs SET state="removed" WHERE col = ? AND id = ?',
              [this.name, id],
              function () {
                if (success) {
                  return success(id)
                }
              },
              error
            )
          } else {
            return tx.executeSql(
              "INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
              [this.name, id, "removed", JSON.stringify({ _id: id })],
              function () {
                if (success) {
                  return success(id)
                }
              },
              error
            )
          }
        },
        error
      )
    }, error)
  }

  cache(docs: any, selector: any, options: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      // Add all non-local that are not upserted or removed
      return async.eachSeries(
        docs,
        (doc: any, callback: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, doc._id],
            (tx: any, results: any) => {
              // Check if present and not upserted/deleted
              if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
                const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null

                // If _rev present, make sure that not overwritten by lower _rev
                if (!existing || !doc._rev || !existing._rev || doc._rev >= existing._rev) {
                  // Upsert
                  return tx.executeSql(
                    "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                    [this.name, doc._id, "cached", JSON.stringify(doc)],
                    () => callback(),
                    error
                  )
                } else {
                  return callback()
                }
              } else {
                return callback()
              }
            },
            callback,
            error
          )
        },
        (err: any) => {
          let sort: any
          if (err) {
            if (error) {
              error(err)
            }
            return
          }

          // Rows have been cached, now look for stale ones to remove
          const docsMap = _.fromPairs(_.zip(_.map(docs, "_id"), docs))

          if (options.sort) {
            sort = compileSort(options.sort)
          }

          // Perform query, removing rows missing in docs from local db
          return this.find(selector, options).fetch((results: any) => {
            return this.db.transaction((tx: any) => {
              return async.eachSeries(
                results,
                (result: any, callback: any) => {
                  // If not present in docs and is present locally and not upserted/deleted
                  return tx.executeSql(
                    "SELECT * FROM docs WHERE col = ? AND id = ?",
                    [this.name, result._id],
                    (tx: any, rows: any) => {
                      if (!docsMap[result._id] && rows.rows.length > 0 && rows.rows.item(0).state === "cached") {
                        // If past end on sorted limited, ignore
                        if (options.sort && options.limit && docs.length === options.limit) {
                          if (sort(result, _.last(docs)) >= 0) {
                            return callback()
                          }
                        }

                        // Item is gone from server, remove locally
                        return tx.executeSql(
                          "DELETE FROM docs WHERE col = ? AND id = ?",
                          [this.name, result._id],
                          () => callback(),
                          error
                        )
                      } else {
                        return callback()
                      }
                    },
                    callback,
                    error
                  )
                },
                function (err: any) {
                  if (err != null) {
                    if (error != null) {
                      error(err)
                    }
                    return
                  }
                  if (success != null) {
                    return success()
                  }
                }
              )
            }, error)
          }, error)
        }
      )
    }, error)
  }

  pendingUpserts(success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.readTransaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND state = ?",
        [this.name, "upserted"],
        function (tx: any, results: any) {
          const docs = []
          for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            const row = results.rows.item(i)
            docs.push(JSON.parse(row.doc))
          }
          if (success != null) {
            return success(docs)
          }
        },
        error
      )
    }, error)
  }

  pendingRemoves(success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.readTransaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND state = ?",
        [this.name, "removed"],
        function (tx: any, results: any) {
          const docs = []
          for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            const row = results.rows.item(i)
            docs.push(JSON.parse(row.doc)._id)
          }
          if (success != null) {
            return success(docs)
          }
        },
        error
      )
    }, error)
  }

  resolveUpsert(doc: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    // Handle both single and multiple resolve
    let items = doc
    if (!_.isArray(items)) {
      items = [items]
    }

    // Find records
    return this.db.transaction((tx: any) => {
      return async.eachSeries(
        items,
        (item: any, cb: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, item._id],
            (tx: any, results: any) => {
              if (results.rows.length > 0) {
                // Only safely remove upsert if doc is the same
                if (
                  results.rows.item(0).state === "upserted" &&
                  _.isEqual(JSON.parse(results.rows.item(0).doc), item)
                ) {
                  tx.executeSql(
                    'UPDATE docs SET state="cached" WHERE col = ? AND id = ?',
                    [this.name, item._id],
                    doNothing,
                    error
                  )
                  return cb()
                } else {
                  return cb()
                }
              } else {
                // Upsert removed, which is fine
                return cb()
              }
            },
            error
          )
        },
        function (err: any) {
          if (err) {
            return error(err)
          }

          // Success
          if (success) {
            return success(doc)
          }
        }
      )
    }, error)
  }

  resolveRemove(id: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    // Find record
    return this.db.transaction((tx: any) => {
      // Only safely remove if removed state
      return tx.executeSql(
        'DELETE FROM docs WHERE state="removed" AND col = ? AND id = ?',
        [this.name, id],
        function () {
          if (success) {
            return success(id)
          }
        },
        error
      )
    }, error)
  }

  // Add but do not overwrite or record as upsert
  seed(doc: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND id = ?",
        [this.name, doc._id],
        (tx: any, results: any) => {
          // Only insert if not present
          if (results.rows.length === 0) {
            return tx.executeSql(
              "INSERT INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
              [this.name, doc._id, "cached", JSON.stringify(doc)],
              function () {
                if (success) {
                  return success(doc)
                }
              },
              error
            )
          } else {
            if (success) {
              return success(doc)
            }
          }
        },
        error
      )
    }, error)
  }

  // Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne(doc: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND id = ?",
        [this.name, doc._id],
        (tx: any, results: any) => {
          // Only insert if not present or cached
          if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
            const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null

            // If _rev present, make sure that not overwritten by lower _rev
            if (!existing || !doc._rev || !existing._rev || doc._rev >= existing._rev) {
              return tx.executeSql(
                "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                [this.name, doc._id, "cached", JSON.stringify(doc)],
                function () {
                  if (success) {
                    return success(doc)
                  }
                },
                error
              )
            } else {
              if (success) {
                return success(doc)
              }
            }
          } else {
            if (success) {
              return success(doc)
            }
          }
        },
        error
      )
    }, error)
  }
}
