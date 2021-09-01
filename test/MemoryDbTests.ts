// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import { assert } from "chai"
import MemoryDb from "../src/MemoryDb"
import db_queries from "./db_queries"
import db_caching from "./db_caching"
import _ from "lodash"

describe("MemoryDb", function () {
  before(function (done: any) {
    this.reset = (done: any) => {
      this.db = new MemoryDb()
      this.db.addCollection("scratch")
      this.col = this.db.scratch
      done()
    }
    return this.reset(done)
  })

  describe("passes queries", function (this: any) {
    return db_queries.call(this)
  })

  describe("passes caching", function (this: any) {
    return db_caching.call(this)
  })

  return describe("safety", function () {
    before(function (this: any) {
      return (this.setupSafety = function (type: any) {
        this.db = new MemoryDb({ safety: type })
        this.db.addCollection("scratch")
        return (this.col = this.db.scratch)
      })
    })

    describe("default (clone)", function () {
      beforeEach(function (this: any) {
        return this.setupSafety()
      })

      it("find returns different copy", function (done: any) {
        const row = { _id: "1", a: "apple" }
        return this.col.cache([row], {}, {}, () => {
          return this.col.find({}).fetch(function (results: any) {
            assert(row !== results[0])
            done()
          })
        })
      })

      return it("upsert is a clone", function (done: any) {
        const row = { _id: "1", a: "apple" }
        return this.col.upsert([row], () => {
          row.a = "banana"
          return this.col.find({}).fetch(function (results: any) {
            assert.equal(results[0].a, "apple")
            done()
          })
        })
      })
    })

    return describe("freeze", function () {
      beforeEach(function (this: any) {
        return this.setupSafety("freeze")
      })

      it("upsert is a clone", function (done: any) {
        const row = { _id: "1", a: "apple" }
        return this.col.upsert([row], () => {
          row.a = "banana"
          assert.equal(row.a, "banana")
          return this.col.find({}).fetch(function (results: any) {
            assert.equal(results[0].a, "apple")
            done()
          })
        })
      })

      return it("find returns frozen", function (done: any) {
        const row = { _id: "1", a: "apple" }
        return this.col.upsert([row], () => {
          return this.col.find({}).fetch(function (results: any) {
            assert(row !== results[0], "Different row")
            assert.throws(() => {
              results[0].a = "banana"
            })
            done()
          })
        })
      })
    })
  })
})
