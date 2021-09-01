// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import IndexedDb from "../src/IndexedDb"
import db_queries from "./db_queries"
import db_caching from "./db_caching"
import _ from "lodash"

describe("IndexedDb", function () {
  before(function (done: any) {
    this.reset = (done: any) => {
      return (this.db = new IndexedDb({ namespace: "db.scratch" }, () => {
        return this.db.removeCollection("scratch", () => {
          return this.db.addCollection("scratch", () => {
            this.col = this.db.scratch
            done()
          })
        })
      }))
    }
    return this.reset(done)
  })

  describe("passes queries", function (this: any) {
    return db_queries.call(this)
  })

  return describe("passes caching", function (this: any) {
    return db_caching.call(this)
  })
})

describe("IndexedDb storage", function () {
  beforeEach(function (done: any) {
    return (this.db = new IndexedDb({ namespace: "db.scratch" }, () => {
      return this.db.removeCollection("scratch", () => {
        return this.db.addCollection("scratch", () => done())
      })
    }))
  })

  it("retains items", function (done: any) {
    return this.db.scratch.upsert({ _id: "1", a: "Alice" }, function () {
      let db2: any
      return (db2 = new IndexedDb({ namespace: "db.scratch" }, () =>
        db2.addCollection("scratch", () =>
          db2.scratch.find({}).fetch(function (results: any) {
            assert.equal(results[0].a, "Alice")
            done()
          })
        )
      ))
    })
  })

  it("retains upserts", function (done: any) {
    return this.db.scratch.cacheOne({ _id: "1", a: "Alice" }, () => {
      return this.db.scratch.upsert({ _id: "1", a: "Bob" }, function () {
        let db2: any
        return (db2 = new IndexedDb({ namespace: "db.scratch" }, () =>
          db2.addCollection("scratch", () =>
            db2.scratch.find({}).fetch(function (results: any) {
              assert.deepEqual(results, [{ _id: "1", a: "Bob" }])
              return db2.scratch.pendingUpserts(function (upserts: any) {
                assert.equal(upserts.length, 1)
                assert.deepEqual(upserts[0].doc, { _id: "1", a: "Bob" })
                assert.deepEqual(upserts[0].base, { _id: "1", a: "Alice" })
                done()
              })
            })
          )
        ))
      })
    })
  })

  return it("retains removes", function (done: any) {
    return this.db.scratch.seed({ _id: "1", a: "Alice" }, () => {
      return this.db.scratch.remove("1", function () {
        let db2: any
        return (db2 = new IndexedDb({ namespace: "db.scratch" }, () =>
          db2.addCollection("scratch", () =>
            db2.scratch.pendingRemoves(function (removes: any) {
              assert.deepEqual(removes, ["1"])
              done()
            })
          )
        ))
      })
    })
  })
})
