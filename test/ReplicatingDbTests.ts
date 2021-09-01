// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import ReplicatingDb from "../src/ReplicatingDb"
import MemoryDb from "../src/MemoryDb"
import db_queries from "./db_queries"
import db_caching from "./db_caching"
import _ from "lodash"
import async from "async"

function error(err: any) {
  console.log(err)
  return assert.fail(JSON.stringify(err))
}

describe("ReplicatingDb", function () {
  describe("passes queries", function (this: any) {
    before(function (
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      done: any
    ) {
      this.reset = (done: any) => {
        this.masterDb = new MemoryDb()
        this.replicaDb = new MemoryDb()

        this.masterDb.addCollection("scratch")
        this.replicaDb.addCollection("scratch")

        this.db = new ReplicatingDb(this.masterDb, this.replicaDb)
        this.db.addCollection("scratch")
        this.col = this.db.scratch
        done()
      }
      return this.reset(done)
    })

    return db_queries.call(this)
  })

  describe("passes caching", function (this: any) {
    before(function (
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      done: any
    ) {
      this.reset = (done: any) => {
        this.masterDb = new MemoryDb()
        this.replicaDb = new MemoryDb()

        this.masterDb.addCollection("scratch")
        this.replicaDb.addCollection("scratch")

        this.db = new ReplicatingDb(this.masterDb, this.replicaDb)
        this.db.addCollection("scratch")
        this.col = this.db.scratch
        done()
      }
      return this.reset(done)
    })

    return db_caching.call(this)
  })

  return describe("passes caching with find on replica", function (this: any) {
    before(function (
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      this: any,
      done: any
    ) {
      this.reset = (done: any) => {
        this.masterDb = new MemoryDb()
        this.replicaDb = new MemoryDb()

        this.masterDb.addCollection("scratch")
        this.replicaDb.addCollection("scratch")

        this.db = new ReplicatingDb(this.masterDb, this.replicaDb)
        this.db.addCollection("scratch")
        this.col = this.db.scratch

        // Use replica to ensure that caching works on replica too
        this.db.scratch.find = this.replicaDb.scratch.find.bind(this.replicaDb.scratch)
        this.db.scratch.findOne = this.replicaDb.scratch.findOne.bind(this.replicaDb.scratch)

        done()
      }
      return this.reset(done)
    })

    return db_caching.call(this)
  })
})
