// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import LocalStorageDb from "../src/LocalStorageDb"
import db_queries from "./db_queries"
import db_caching from "./db_caching"
import _ from "lodash"

describe("LocalStorageDb", function () {
  before(function (done: any) {
    this.reset = (done: any) => {
      this.db = new LocalStorageDb()
      this.db.addCollection("scratch")
      this.col = this.db.scratch
      done()
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

describe("LocalStorageDb with local storage", function () {
  before(function (this: any) {
    return (this.db = new LocalStorageDb({ namespace: "db.scratch" }))
  })

  beforeEach(function (done: any) {
    this.db.removeCollection("scratch")
    this.db.addCollection("scratch")
    done()
  })

  it("retains items", function (done: any) {
    return this.db.scratch.upsert({ _id: "1", a: "Alice" }, function () {
      const db2 = new LocalStorageDb({ namespace: "db.scratch" })
      db2.addCollection("scratch")
      return db2.scratch.find({}).fetch(function (results: any) {
        assert.equal(results[0].a, "Alice")
        done()
      })
    })
  })

  it("retains upserts", function (done: any) {
    return this.db.scratch.cacheOne({ _id: "1", a: "Alice" }, () => {
      return this.db.scratch.upsert(
        { _id: "1", a: "Bob" },
        () =>
          new LocalStorageDb({ namespace: "db.scratch" }, (db2: any) =>
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
          )
      )
    })
  })

  return it("retains removes", function (done: any) {
    return this.db.scratch.seed({ _id: "1", a: "Alice" }, () => {
      return this.db.scratch.remove("1", function () {
        const db2 = new LocalStorageDb({ namespace: "db.scratch" })
        db2.addCollection("scratch")
        return db2.scratch.pendingRemoves(function (removes: any) {
          assert.deepEqual(removes, ["1"])
          done()
        })
      })
    })
  })
})

describe("LocalStorageDb without local storage", function () {
  before(function (this: any) {
    return (this.db = new LocalStorageDb())
  })

  beforeEach(function (done: any) {
    this.db.removeCollection("scratch")
    this.db.addCollection("scratch")
    done()
  })

  it("does not retain items", function (done: any) {
    return this.db.scratch.upsert({ _id: "1", a: "Alice" }, function () {
      const db2 = new LocalStorageDb()
      db2.addCollection("scratch")
      return db2.scratch.find({}).fetch(function (results: any) {
        assert.equal(results.length, 0)
        done()
      })
    })
  })

  it("does not retain upserts", function (done: any) {
    return this.db.scratch.upsert({ _id: "1", a: "Alice" }, function () {
      const db2 = new LocalStorageDb()
      db2.addCollection("scratch")
      return db2.scratch.find({}).fetch((results: any) =>
        db2.scratch.pendingUpserts(function (upserts: any) {
          assert.equal(results.length, 0)
          done()
        })
      )
    })
  })

  return it("does not retain removes", function (done: any) {
    return this.db.scratch.seed({ _id: "1", a: "Alice" }, () => {
      return this.db.scratch.remove("1", function () {
        const db2 = new LocalStorageDb()
        db2.addCollection("scratch")
        return db2.scratch.pendingRemoves(function (removes: any) {
          assert.equal(removes.length, 0)
          done()
        })
      })
    })
  })
})
