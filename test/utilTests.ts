// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import * as utils from "../src/utils"
import db_queries from "./db_queries"
import db_caching from "./db_caching"
import _ from "lodash"
import MemoryDb from "../src/MemoryDb"

describe("autoselected Local Db", function () {
  before(function (done) {
    utils.autoselectLocalDb({ namespace: "db.scratch" }, (db) => {
      this.db = db
      return this.db.addCollection("scratch", () => done())
    })

    return (this.reset = (done) => {
      return this.db.removeCollection("scratch", () => {
        return this.db.addCollection("scratch", () => {
          this.col = this.db.scratch
          return done()
        })
      })
    })
  })

  describe("passes queries", function () {
    return db_queries.call(this)
  })

  return describe("passes caching", function () {
    return db_caching.call(this)
  })
})

describe("migrated Local Db", function () {
  beforeEach(function (done) {
    this.from = new MemoryDb()
    this.to = new MemoryDb()
    this.from.addCollection("a")
    this.to.addCollection("a")
    return done()
  })

  it("migrates upserts", function (done) {
    return this.from.a.upsert({ _id: "1", x: 1 }, () => {
      return utils.migrateLocalDb(this.from, this.to, () => {
        return this.to.a.pendingUpserts((upserts) => {
          assert.deepEqual(upserts, [{ doc: { _id: "1", x: 1 }, base: null }])
          this.from.a.pendingUpserts((upserts2) => assert.equal(upserts2.length, 0))
          return done()
        })
      })
    })
  })

  it("migrates removes", function (done) {
    return this.from.a.remove("1", () => {
      return utils.migrateLocalDb(this.from, this.to, () => {
        return this.to.a.pendingRemoves(function (removes) {
          assert.deepEqual(removes, ["1"])
          return done()
        })
      })
    })
  })

  it("does not migrate cached", function (done) {
    return this.from.a.cacheOne({ _id: "1", x: 1 }, () => {
      return utils.migrateLocalDb(this.from, this.to, () => {
        return this.to.a.pendingUpserts(function (upserts) {
          assert.equal(upserts.length, 0)
          return done()
        })
      })
    })
  })

  return it("only migrates collections present in both", function (done) {
    this.from.addCollection("b")
    return this.from.b.upsert({ _id: "1", x: 1 }, () => {
      return utils.migrateLocalDb(this.from, this.to, () => {
        assert(!this.to.b)
        return done()
      })
    })
  })
})

describe("cloneLocalDb", function () {
  beforeEach(function (done) {
    this.from = new MemoryDb()
    this.to = new MemoryDb()
    this.from.addCollection("a")
    return done()
  })

  it("clones upserts", function (done) {
    return this.from.a.upsert({ _id: "1", x: 1 }, () => {
      return utils.cloneLocalDb(this.from, this.to, () => {
        return this.to.a.pendingUpserts((upserts) => {
          assert.deepEqual(upserts, [{ doc: { _id: "1", x: 1 }, base: null }])
          this.from.a.pendingUpserts((upserts2) => assert.equal(upserts2.length, 1))
          return done()
        })
      })
    })
  })

  it("clones upserts with bases", function (done) {
    return this.from.a.upsert({ _id: "1", x: 1 }, { _id: "1", x: -1 }, () => {
      return utils.cloneLocalDb(this.from, this.to, () => {
        return this.to.a.pendingUpserts((upserts) => {
          assert.deepEqual(upserts, [{ doc: { _id: "1", x: 1 }, base: { _id: "1", x: -1 } }])
          this.from.a.pendingUpserts((upserts2) => assert.equal(upserts2.length, 1))
          return done()
        })
      })
    })
  })

  it("clones removes", function (done) {
    return this.from.a.remove("1", () => {
      return utils.cloneLocalDb(this.from, this.to, () => {
        return this.to.a.pendingRemoves((removes) => {
          assert.deepEqual(removes, ["1"])
          return this.from.a.pendingRemoves((removes) => {
            assert.deepEqual(removes, ["1"])
            return done()
          })
        })
      })
    })
  })

  return it("clones cached", function (done) {
    return this.from.a.cacheOne({ _id: "1", x: 1 }, () => {
      return utils.cloneLocalDb(this.from, this.to, () => {
        return this.to.a.pendingUpserts((upserts) => {
          assert.equal(upserts.length, 0)
          return this.to.a.find({}).fetch((items) => {
            assert.deepEqual(items[0], { _id: "1", x: 1 })
            return done()
          })
        })
      })
    })
  })
})

// it 'fails on error cached', (done) ->
//   @from.a.remove "1", =>
//     @to.a.remove = (id, success, error) -> error(new Error("ohoh"))
//     utils.cloneLocalDb @from, @to, =>
//       assert.fail("Should fail")
//     , (err) =>
//       assert err
//       done()
