import _ from "lodash"
import async from "async"
import * as utils from "./utils"
import { processFind } from "./utils"
import { compileSort } from "./selector"
import { MinimongoCollection, MinimongoDb, MinimongoLocalCollection } from "./types"

// Do nothing callback for success
function doNothing() {}

// WebSQLDb adapter for minimongo DB
// Supports sqlite plugin, if available and specified in option as {storage: 'sqlite'}
export default class WebSQLDb implements MinimongoDb {
  collections: { [collectionName: string]: MinimongoCollection<any> }
  db: any

  constructor(options: any, success: any, error: any) {
    this.collections = {}

    if (options.storage === "sqlite" && window["sqlitePlugin"]) {
      // sqlite plugin does not support db.version
      // and since db operations can only be executed once the db is properly open
      // we add the schema version migration to the success callback
      window["sqlitePlugin"].openDatabase(
        { name: "minimongo_" + options.namespace, location: "default" },
        (sqliteDb: any) => {
          console.log("Database open successful")
          this.db = sqliteDb
          console.log("Checking version")
          this.db.executeSql(
            "PRAGMA user_version",
            [],
            (rs: any) => {
              const version = rs.rows.item(0).user_version
              if (version === 0) {
                this.db.transaction((tx: any) => {
                  tx.executeSql(
                    `\
CREATE TABLE docs (
col TEXT NOT NULL,
id TEXT NOT NULL,
state TEXT NOT NULL,
doc TEXT,
base TEXT,
PRIMARY KEY (col, id));`,
                    [],
                    doNothing,
                    (tx: any, err: any) => error(err)
                  )
                  tx.executeSql("PRAGMA user_version = 2", [], doNothing, (tx: any, err: any) => error(err))
                  return success(this)
                })
              } else {
                success(this)
              }
            },
            function (err: any) {
              console.log("version check error :: ", JSON.stringify(err))
              error(err)
            }
          )
        },
        function (err: any) {
          console.log("Error opening databse :: ", JSON.stringify(err))
          error(err)
        }
      )
    } else {
      try {
        // Create database
        // TODO escape name
        this.db = window["openDatabase"](
          "minimongo_" + options.namespace,
          "",
          "Minimongo:" + options.namespace,
          5 * 1024 * 1024
        )
        if (!this.db) {
          return error(new Error("Failed to create database"))
        }
      } catch (ex) {
        if (error) {
          error(ex)
        }
        return
      }
    }

    const migrateToV1 = (tx: any) =>
      tx.executeSql(
        `\
CREATE TABLE docs (
col TEXT NOT NULL,
id TEXT NOT NULL,
state TEXT NOT NULL,
doc TEXT,
PRIMARY KEY (col, id));`,
        [],
        doNothing,
        (tx: any, err: any) => error(err)
      )

    const migrateToV2 = (tx: any) =>
      tx.executeSql(
        `\
ALTER TABLE docs ADD COLUMN base TEXT;`,
        [],
        doNothing,
        (tx: any, err: any) => error(err)
      )

    // Check if at v2 version
    const checkV2 = () => {
      if (this.db.version === "1.0") {
        return this.db.changeVersion("1.0", "2.0", migrateToV2, error, () => {
          if (success) {
            return success(this)
          }
        })
      } else if (this.db.version !== "2.0") {
        return error("Unknown db version " + this.db.version)
      } else {
        if (success) {
          return success(this)
        }
      }
    }

    if (!options.storage) {
      if (!this.db.version) {
        this.db.changeVersion("", "1.0", migrateToV1, error, checkV2)
      } else {
        checkV2()
      }
    }

    return this.db
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
      (tx: any) => tx.executeSql("DELETE FROM docs WHERE col = ?", [name], success, (tx: any, err: any) => error(err)),
      error
    )
  }

  getCollectionNames() {
    return _.keys(this.collections)
  }
}

// Stores data in indexeddb store
class Collection<T> implements MinimongoLocalCollection<T> {
  name: string
  db: any

  constructor(name: string, db: any) {
    this.name = name
    this.db = db
  }

  find(selector: any, options?: any) {
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
        (tx: any, err: any) => error(err)
      )
    }, error)
  }

  upsert(docs: any, bases: any, success: any, error?: any) {
    let items: any
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction(
      (tx: any) => {
        const ids = _.map(items, (item: any) => item.doc._id)

        // Get bases
        bases = {}
        return async.eachSeries(
          ids,
          ((id: any, callback: any) => {
            return tx.executeSql(
              "SELECT * FROM docs WHERE col = ? AND id = ?",
              [this.name, id],
              function (tx2: any, results: any) {
                tx = tx2
                if (results.rows.length > 0) {
                  const row = results.rows.item(0)
                  if (row.state === "upserted") {
                    bases[row.id] = row.base ? JSON.parse(row.base) : null
                  } else if (row.state === "cached") {
                    bases[row.id] = JSON.parse(row.doc)
                  }
                }
                return callback()
              },
              (tx: any, err: any) => error(err)
            )
          }) as any,
          () => {
            return (() => {
              const result = []
              for (let item of items) {
                var base
                const id = item.doc._id

                // Prefer explicit base
                if (item.base !== undefined) {
                  ;({ base } = item)
                } else if (bases[id]) {
                  base = bases[id]
                } else {
                  base = null
                }
                result.push(
                  tx.executeSql(
                    "INSERT OR REPLACE INTO docs (col, id, state, doc, base) VALUES (?, ?, ?, ?, ?)",
                    [this.name, item.doc._id, "upserted", JSON.stringify(item.doc), JSON.stringify(base)],
                    doNothing,
                    (tx: any, err: any) => error(err)
                  )
                )
              }
              return result
            })()
          }
        )
      },
      error,
      function () {
        if (success) {
          return success(docs)
        }
      }
    )
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
              (tx: any, err: any) => error(err)
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
              (tx: any, err: any) => error(err)
            )
          }
        },
        (tx: any, err: any) => error(err)
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
        ((doc: any, callback: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, doc._id],
            (tx: any, results: any) => {
              // Check if present and not upserted/deleted
              if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
                const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null

                // Exclude any excluded _ids from being cached/uncached
                if (options && options.exclude && options.exclude.includes(doc._id)) {
                  callback()
                  return
                }

                // If _rev present, make sure that not overwritten by lower or equal _rev
                if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
                  // Upsert
                  return tx.executeSql(
                    "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                    [this.name, doc._id, "cached", JSON.stringify(doc)],
                    () => callback(),
                    (tx: any, err: any) => error(err)
                  )
                } else {
                  return callback()
                }
              } else {
                return callback()
              }
            },
            (tx: any, err: any) => error(err)
          )
        }) as any,
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
                ((result: any, callback: any) => {
                  // If not present in docs and is present locally and not upserted/deleted
                  return tx.executeSql(
                    "SELECT * FROM docs WHERE col = ? AND id = ?",
                    [this.name, result._id],
                    (tx: any, rows: any) => {
                      if (!docsMap[result._id] && rows.rows.length > 0 && rows.rows.item(0).state === "cached") {
                        // Exclude any excluded _ids from being cached/uncached
                        if (options && options.exclude && options.exclude.includes(result._id)) {
                          callback()
                          return
                        }

                        // If at limit
                        if (options.limit && docs.length === options.limit) {
                          // If past end on sorted limited, ignore
                          if (options.sort && sort(result, _.last(docs)) >= 0) {
                            return callback()
                          }
                          // If no sort, ignore
                          if (!options.sort) {
                            return callback()
                          }
                        }

                        // Item is gone from server, remove locally
                        return tx.executeSql(
                          "DELETE FROM docs WHERE col = ? AND id = ?",
                          [this.name, result._id],
                          () => callback(),
                          (tx: any, err: any) => error(err)
                        )
                      } else {
                        return callback()
                      }
                    },
                    (tx: any, err: any) => error(err)
                  )
                }) as any,
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
            docs.push({ doc: JSON.parse(row.doc), base: row.base ? JSON.parse(row.base) : null })
          }
          if (success != null) {
            return success(docs)
          }
        },
        (tx: any, err: any) => error(err)
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
        (tx: any, err: any) => error(err)
      )
    }, error)
  }

  resolveUpserts(upserts: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    // Find records
    return this.db.transaction((tx: any) => {
      return async.eachSeries(
        upserts,
        ((upsert: any, cb: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, upsert.doc._id],
            (tx: any, results: any) => {
              if (results.rows.length > 0 && results.rows.item(0).state === "upserted") {
                // Only safely remove upsert if doc is the same
                if (_.isEqual(JSON.parse(results.rows.item(0).doc), upsert.doc)) {
                  tx.executeSql(
                    'UPDATE docs SET state="cached" WHERE col = ? AND id = ?',
                    [this.name, upsert.doc._id],
                    doNothing,
                    (tx: any, err: any) => error(err)
                  )
                  return cb()
                } else {
                  tx.executeSql(
                    "UPDATE docs SET base=? WHERE col = ? AND id = ?",
                    [JSON.stringify(upsert.doc), this.name, upsert.doc._id],
                    doNothing,
                    (tx: any, err: any) => error(err)
                  )
                  return cb()
                }
              } else {
                // Upsert removed, which is fine
                return cb()
              }
            },
            (tx: any, err: any) => error(err)
          )
        }) as any,
        function (err: any) {
          if (err) {
            return error(err)
          }

          // Success
          if (success) {
            return success()
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
        (tx: any, err: any) => error(err)
      )
    }, error)
  }

  // Add but do not overwrite or record as upsert
  seed(docs: any, success: any, error: any) {
    if (!_.isArray(docs)) {
      docs = [docs]
    }

    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      // Add all non-local that are not upserted or removed
      return async.eachSeries(
        docs,
        ((doc: any, callback: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, doc._id],
            (tx: any, results: any) => {
              // Check if present
              if (results.rows.length === 0) {
                // Upsert
                return tx.executeSql(
                  "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                  [this.name, doc._id, "cached", JSON.stringify(doc)],
                  () => callback(),
                  (tx: any, err: any) => error(err)
                )
              } else {
                return callback()
              }
            },
            (tx: any, err: any) => error(err)
          )
        }) as any,
        (err: any) => {
          if (err) {
            if (error) {
              return error(err)
            }
          } else {
            if (success) {
              return success()
            }
          }
        }
      )
    }, error)
  }

  // Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne(doc: any, success: any, error: any) {
    return this.cacheList([doc], success, error)
  }

  cacheList(docs: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      // Add all non-local that are not upserted or removed
      return async.eachSeries(
        docs,
        ((doc: any, callback: any) => {
          return tx.executeSql(
            "SELECT * FROM docs WHERE col = ? AND id = ?",
            [this.name, doc._id],
            (tx: any, results: any) => {
              // Only insert if not present or cached
              if (results.rows.length === 0 || results.rows.item(0).state === "cached") {
                const existing = results.rows.length > 0 ? JSON.parse(results.rows.item(0).doc) : null

                // If _rev present, make sure that not overwritten by lower or equal _rev
                if (!existing || !doc._rev || !existing._rev || doc._rev > existing._rev) {
                  return tx.executeSql(
                    "INSERT OR REPLACE INTO docs (col, id, state, doc) VALUES (?, ?, ?, ?)",
                    [this.name, doc._id, "cached", JSON.stringify(doc)],
                    () => callback(),
                    (tx: any, err: any) => callback(err)
                  )
                } else {
                  return callback()
                }
              } else {
                return callback()
              }
            },
            (tx: any, err: any) => callback(err)
          )
        }) as any,
        (err: any) => {
          if (err) {
            if (error) {
              return error(err)
            }
          } else {
            if (success) {
              return success(docs)
            }
          }
        }
      )
    }, error)
  }

  uncache(selector: any, success: any, error: any) {
    const compiledSelector = utils.compileDocumentSelector(selector)

    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      return tx.executeSql(
        "SELECT * FROM docs WHERE col = ? AND state = ?",
        [this.name, "cached"],
        (tx: any, results: any) => {
          // Determine which to remove
          const toRemove = []
          for (let i = 0, end = results.rows.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            const row = results.rows.item(i)
            const doc = JSON.parse(row.doc)
            if (compiledSelector(doc)) {
              toRemove.push(doc._id)
            }
          }

          // Add all non-local that are not upserted or removed
          return async.eachSeries(
            toRemove,
            ((id: any, callback: any) => {
              // Only safely remove if removed state
              return tx.executeSql(
                'DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?',
                [this.name, id],
                () => callback(),
                (tx: any, err: any) => error(err)
              )
            }) as any,
            (err: any) => {
              if (err) {
                if (error) {
                  return error(err)
                }
              } else {
                if (success) {
                  return success()
                }
              }
            }
          )
        },
        (tx: any, err: any) => error(err)
      )
    }, error)
  }

  uncacheList(ids: any, success: any, error: any) {
    // Android 2.x requires error callback
    error = error || function () {}

    return this.db.transaction((tx: any) => {
      // Add all non-local that are not upserted or removed
      return async.eachSeries(
        ids,
        ((id: any, callback: any) => {
          // Only safely remove if removed state
          return tx.executeSql(
            'DELETE FROM docs WHERE state="cached" AND col = ? AND id = ?',
            [this.name, id],
            () => callback(),
            (tx: any, err: any) => error(err)
          )
        }) as any,
        (err: any) => {
          if (err) {
            if (error) {
              return error(err)
            }
          } else {
            if (success) {
              return success()
            }
          }
        }
      )
    }, error)
  }
}
