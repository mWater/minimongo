// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import _ from "lodash"
import chai from "chai"
const { assert } = chai
import sinon from "sinon"
import lolex from "lolex"
import MemoryDb from "../src/MemoryDb"
import HybridDb from "../src/HybridDb"
import db_queries from "./db_queries"

// Note: Assumes local db is synchronous!
function fail() {
  throw new Error("failed")
}

describe("HybridDb", function () {
  before(function (done) {
    this.reset = (done) => {
      this.local = new MemoryDb()
      this.remote = new MemoryDb()
      this.hybrid = new HybridDb(this.local, this.remote)

      this.local.addCollection("scratch")
      this.lc = this.local.scratch

      this.remote.addCollection("scratch")
      this.rc = this.remote.scratch

      this.hybrid.addCollection("scratch")
      this.hc = this.hybrid.scratch
      this.col = this.hc
      return done()
    }

    return this.reset(done)
  })

  describe("passes queries", function () {
    beforeEach(function (done) {
      return this.reset(done)
    })

    return db_queries.call(this)
  })

  context("resets each time", function () {
    beforeEach(function (done) {
      return this.reset(done)
    })

    describe("interim:true (default)", function () {
      it("find gives only one result if data unchanged", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 1 })
        this.rc.seed({ _id: "2", a: 2 })

        let calls = 0
        return this.hc.find({}).fetch(function (data) {
          calls += 1
          assert.equal(data.length, 2)
          assert.equal(calls, 1)
          return done()
        }, fail)
      })

      it("find gives results twice if remote gives different answer", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        let calls = 0
        return this.hc.find({}).fetch(function (data) {
          assert.equal(data.length, 2)
          calls = calls + 1
          if (calls >= 2) {
            return done()
          }
        }, fail)
      })

      it("find gives results once if remote gives same answer with sort differences", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.find = () => ({
          fetch(success) {
            return success([
              { _id: "2", a: 2 },
              { _id: "1", a: 1 }
            ])
          }
        })

        return this.hc.find({}).fetch(function (data) {
          assert.equal(data.length, 2)
          return done()
        }, fail)
      })

      return it("local upserts are respected", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.upsert({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 1 })
        this.rc.seed({ _id: "2", a: 4 })

        return this.hc.findOne(
          { _id: "2" },
          function (doc) {
            assert.deepEqual(doc, { _id: "2", a: 2 })
            return done()
          },
          fail
        )
      })
    })

    describe("cacheFind: true (default)", function () {
      it("find performs full field remote queries", function (done) {
        this.rc.seed({ _id: "1", a: 1, b: 11 })
        this.rc.seed({ _id: "2", a: 2, b: 12 })

        return this.hc.find({}, { fields: { b: 0 } }).fetch((data) => {
          if (data.length === 0) {
            return
          }
          assert.isUndefined(data[0].b)
          return this.lc.findOne({ _id: "1" }, function (doc) {
            assert.equal(doc.b, 11)
            return done()
          })
        })
      })

      it("caches remote data", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 2 })

        let calls = 0
        return this.hc.find({}).fetch((data) => {
          assert.equal(data.length, 2)
          calls = calls + 1

          // After second call, check that local collection has latest
          if (calls === 2) {
            return this.lc.find({}).fetch(function (data) {
              assert.equal(data.length, 2)
              assert.deepEqual(_.pluck(data, "a"), [3, 2])
              return done()
            })
          }
        })
      })

      return it("snapshots local upserts/removes to prevent race condition", function (done) {
        // If the server receives the upsert/remove *after* the query and returns *before* the
        // query does, a newly upserted item may be removed from cache

        this.lc.upsert({ _id: "1", a: 1 })

        const oldRcFind = this.rc.find
        this.rc.find = () => {
          return {
            fetch: (success) => {
              // Simulate separate process having performed and resolved upsert
              this.lc.pendingUpserts((us) => {
                return this.lc.resolveUpserts(us)
              })
              return success([])
            }
          }
        }

        return this.hc.find({}, { interim: false }).fetch((data) => {
          this.rc.find = oldRcFind
          assert.equal(data.length, 1)
          return done()
        })
      })
    })

    describe("cacheFindOne: true (default)", function () {
      it("findOne performs full field remote queries", function (done) {
        this.rc.seed({ _id: "1", a: 1, b: 11 })
        this.rc.seed({ _id: "2", a: 2, b: 12 })

        return this.hc.findOne({ _id: "1" }, { fields: { b: 0 } }, (doc) => {
          assert.isUndefined(doc.b)
          return this.lc.findOne({ _id: "1" }, function (doc) {
            assert.equal(doc.b, 11)
            return done()
          })
        })
      })

      it("findOne gives results twice if remote gives different answer", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        let calls = 0
        return this.hc.findOne(
          { _id: "1" },
          function (data) {
            calls = calls + 1
            if (calls === 1) {
              assert.deepEqual(data, { _id: "1", a: 1 })
            }
            if (calls >= 2) {
              assert.deepEqual(data, { _id: "1", a: 3 })
              return done()
            }
          },
          fail
        )
      })

      it("findOne gives local results once if remote fails", function (done) {
        this.lc.seed({ _id: "1", a: 1 })

        this.rc.findOne = (selector, options = {}, success, error) => error(new Error("fail"))
        this.rc.find = (selector, options) => ({
          fetch(success, error) {
            return error()
          }
        })

        return this.hc.findOne(
          { _id: "1" },
          function (data) {
            assert.equal(data.a, 1)
            return done()
          },
          fail
        )
      })

      it("findOne gives local results selected not by _id once if remote fails", function (done) {
        this.lc.seed({ _id: "1", a: 1 })

        this.rc.findOne = (selector, options = {}, success, error) => error(new Error("fail"))
        this.rc.find = (selector, options) => ({
          fetch(success, error) {
            return error()
          }
        })

        return this.hc.findOne(
          { a: 1 },
          function (data) {
            assert.equal(data.a, 1)
            return done()
          },
          fail
        )
      })

      it("findOne gives local results once if remote fails", function (done) {
        let called = 0
        this.rc.findOne = function (selector, options = {}, success, error) {
          called = called + 1
          return error(new Error("fail"))
        }
        this.rc.find = (selector, options) => ({
          fetch(success, error) {
            called = called + 1
            return error()
          }
        })

        return this.hc.findOne(
          { _id: "xyz" },
          function (data) {
            assert.equal(data, null)
            assert.equal(called, 1)
            return done()
          },
          fail
        )
      })

      return it("findOne keeps local cache updated on remote change", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        let calls = 0
        return this.hc.findOne(
          { _id: "1" },
          (data) => {
            calls = calls + 1
            if (calls === 1) {
              assert.deepEqual(data, { _id: "1", a: 1 })
            }
            if (calls >= 2) {
              assert.deepEqual(data, { _id: "1", a: 3 })
              this.lc.find({}, {}).fetch((data) => assert.deepEqual(_.pluck(data, "a"), [3, 2]))
              return done()
            }
          },
          fail
        )
      })
    })

    describe("interim: false", () =>
      it("find gives final results only", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        const calls = 0
        return this.hc.find({}, { interim: false }).fetch(function (data) {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 4)
          return done()
        }, fail)
      }))

    describe("interim: false with timeout", function () {
      beforeEach(function () {
        return (this.clock = lolex.install())
      })

      afterEach(function () {
        return this.clock.uninstall()
      })

      it("find gives final results if in time", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        const oldFind = this.rc.find
        this.rc.find = (where, params) => {
          return {
            fetch: (success, error) => {
              // Wait a bit
              this.clock.tick(500)
              success([
                { _id: "1", a: 3 },
                { _id: "2", a: 4 }
              ])
              return this.clock.tick(1)
            }
          }
        }

        this.hc.find({}, { interim: false, timeout: 1000 }).fetch(function (data) {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 4)
          return done()
        }, fail)
        return this.clock.tick(1)
      }) // Tick for setTimeout 0

      it("find gives local results if out of time", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        const oldFind = this.rc.find
        this.rc.find = (where, params) => {
          return {
            fetch: (success, error) => {
              // Wait a bit too long
              this.clock.tick(1500)
              success([
                { _id: "1", a: 3 },
                { _id: "2", a: 4 }
              ])
              return this.clock.tick(1)
            }
          }
        }

        this.hc.find({}, { interim: false, timeout: 1000 }).fetch(function (data) {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 2)
          return done()
        }, fail)
        return this.clock.tick(1)
      }) // Tick for setTimeout 0

      it("find gives local results but still caches if out of time", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        const oldFind = this.rc.find
        this.rc.find = (where, params) => {
          return {
            fetch: (success, error) => {
              // Wait a bit too long
              this.clock.tick(1500)
              success([
                { _id: "1", a: 3 },
                { _id: "2", a: 4 }
              ])
              return this.clock.tick(2000)
            }
          }
        }

        this.hc.find({}, { interim: false, timeout: 1000 }).fetch((data) => {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 2)

          // Wait longer for remote to complete
          return setTimeout(() => {
            return this.lc.find({}, {}).fetch((data) => {
              assert.equal(data.length, 2)
              assert.equal(data[0].a, 1, "Should not change since upsert")
              assert.equal(data[1].a, 4)
              return done()
            })
          }, 1000)
        }, fail)
        return this.clock.tick(1)
      }) // Tick for setTimeout 0

      it("find gives local results once if remote fails then out of time", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        const oldFind = this.rc.find
        this.rc.find = (where, params) => {
          return {
            fetch: (success, error) => {
              error(new Error("Fail"))
              return this.clock.tick(1)
            }
          }
        }

        let called = 0

        this.hc.find({}, { interim: false, timeout: 1000 }).fetch((data) => {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 2)

          called += 1

          // Wait a bit too long
          this.clock.tick(1500)

          if (called > 1) {
            console.error("Fail! Called twice")
          }
          assert.equal(called, 1)
          return done()
        }, fail)
        return this.clock.tick(1)
      }) // Tick for setTimeout 0

      return it("find gives local results once if out of time then remote fails", function (done) {
        this.lc.upsert({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        const oldFind = this.rc.find
        this.rc.find = (where, params) => {
          return {
            fetch: (success, error) => {
              this.clock.tick(1500)
              return error(new Error("Fail"))
            }
          }
        }

        let called = 0

        this.hc.find({}, { interim: false, timeout: 1000 }).fetch((data) => {
          assert.equal(data.length, 2)
          assert.equal(data[0].a, 1)
          assert.equal(data[1].a, 2)

          called += 1
          if (called > 1) {
            console.error("Fail! Called twice")
          }

          assert.equal(called, 1)
          return done()
        }, fail)
        return this.clock.tick(1)
      })
    }) // Tick for setTimeout 0

    describe("cacheFind: false", function () {
      it("find performs partial field remote queries", function (done) {
        sinon.spy(this.rc, "find")
        this.rc.seed({ _id: "1", a: 1, b: 11 })
        this.rc.seed({ _id: "2", a: 2, b: 12 })

        return this.hc.find({}, { fields: { b: 0 }, cacheFind: false }).fetch((data) => {
          if (data.length === 0) {
            return
          }
          assert.isUndefined(data[0].b)
          assert.deepEqual(this.rc.find.firstCall.args[1].fields, { b: 0 })
          this.rc.find.restore()
          return done()
        })
      })

      return it("does not cache remote data", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 2 })

        let calls = 0
        return this.hc.find({}, { cacheFind: false }).fetch((data) => {
          assert.equal(data.length, 2)
          calls = calls + 1

          // After second call, check that local collection is unchanged
          if (calls === 2) {
            return this.lc.find({}).fetch(function (data) {
              assert.equal(data.length, 2)
              assert.deepEqual(_.pluck(data, "a"), [1, 2])
              return done()
            })
          }
        })
      })
    })

    describe("cacheFindOne: false", () =>
      it("findOne performs partial field remote queries", function (done) {
        sinon.spy(this.rc, "find")
        this.rc.seed({ _id: "1", a: 1, b: 11 })
        this.rc.seed({ _id: "2", a: 2, b: 12 })

        return this.hc.findOne({ _id: "1" }, { fields: { b: 0 }, cacheFindOne: false }, (data) => {
          if (data === null) {
            return
          }

          assert.isUndefined(data.b)
          assert.deepEqual(this.rc.find.getCall(0).args[1].fields, { b: 0 })
          this.rc.find.restore()
          return done()
        })
      }))

    context("shortcut: false (default)", function () {
      it("findOne calls both local and remote", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        let calls = 0
        return this.hc.findOne(
          { _id: "1" },
          function (data) {
            calls += 1
            if (calls === 1) {
              return assert.deepEqual(data, { _id: "1", a: 1 })
            } else {
              assert.deepEqual(data, { _id: "1", a: 3 })
              return done()
            }
          },
          fail
        )
      })

      context("interim: false", () =>
        it("findOne calls both local and remote", function (done) {
          this.lc.seed({ _id: "1", a: 1 })
          this.lc.seed({ _id: "2", a: 2 })

          this.rc.seed({ _id: "1", a: 3 })
          this.rc.seed({ _id: "2", a: 4 })

          return this.hc.findOne(
            { _id: "1" },
            { interim: false },
            function (data) {
              assert.deepEqual(data, { _id: "1", a: 3 })
              return done()
            },
            fail
          )
        })
      )

      return it("findOne calls remote if not found", function (done) {
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        const calls = 0
        return this.hc.findOne(
          { _id: "1" },
          { shortcut: true },
          function (data) {
            assert.deepEqual(data, { _id: "1", a: 3 })
            return done()
          },
          fail
        )
      })
    })

    context("shortcut: true", function () {
      it("findOne only calls local if found", function (done) {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        const calls = 0
        return this.hc.findOne(
          { _id: "1" },
          { shortcut: true },
          function (data) {
            assert.deepEqual(data, { _id: "1", a: 1 })
            return done()
          },
          fail
        )
      })

      return it("findOne calls remote if not found", function (done) {
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        this.rc.seed({ _id: "2", a: 4 })

        const calls = 0
        return this.hc.findOne(
          { _id: "1" },
          { shortcut: true },
          function (data) {
            assert.deepEqual(data, { _id: "1", a: 3 })
            return done()
          },
          fail
        )
      })
    })

    context("cacheFind: false, interim: false", function () {
      beforeEach(function () {
        this.lc.seed({ _id: "1", a: 1 })
        this.lc.seed({ _id: "2", a: 2 })

        this.rc.seed({ _id: "1", a: 3 })
        return this.rc.seed({ _id: "2", a: 4 })
      })

      it("find only calls remote", function (done) {
        return this.hc.find({}, { cacheFind: false, interim: false }).fetch(function (data) {
          assert.deepEqual(_.pluck(data, "a"), [3, 4])
          return done()
        })
      })

      it("find does not cache results", function (done) {
        return this.hc.find({}, { cacheFind: false, interim: false }).fetch((data) => {
          return this.lc.find({}).fetch((data) => {
            assert.deepEqual(_.pluck(data, "a"), [1, 2])
            return done()
          })
        })
      })

      it("find falls back to local if remote fails", function (done) {
        this.rc.find = (selector, options) => ({
          fetch(success, error) {
            return error()
          }
        })
        return this.hc.find({}, { cacheFind: false, interim: false }).fetch(function (data) {
          assert.deepEqual(_.pluck(data, "a"), [1, 2])
          return done()
        })
      })

      it("find errors if useLocalOnRemoteError:false if remote fails", function (done) {
        this.rc.find = (selector, options) => {
          return {
            fetch(success, error) {
              return error()
            }
          }
        }
        return this.hc.find({}, { cacheFind: false, interim: false, useLocalOnRemoteError: false }).fetch(
          (data) => {
            return assert.fail()
          },
          (err) => done()
        )
      })

      it("find respects local upserts", function (done) {
        this.lc.upsert({ _id: "1", a: 9 })

        return this.hc.find({}, { cacheFind: false, interim: false, sort: ["_id"] }).fetch((data) => {
          assert.deepEqual(_.pluck(data, "a"), [9, 4])
          return done()
        })
      })

      return it("find respects local removes", function (done) {
        this.lc.remove("1")

        return this.hc.find({}, { cacheFind: false, interim: false }).fetch(function (data) {
          assert.deepEqual(_.pluck(data, "a"), [4])
          return done()
        })
      })
    })

    it("upload applies pending upserts", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })
      this.lc.upsert({ _id: "2", a: 2 })

      return this.hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)

          return this.rc.pendingUpserts(function (data) {
            assert.deepEqual(_.pluck(_.pluck(data, "doc"), "a"), [1, 2])
            return done()
          })
        })
      }, fail)
    })

    it("upload sorts pending upserts", function (done) {
      this.lc.upsert({ _id: "1", a: 1, b: 2 })
      this.lc.upsert({ _id: "2", a: 2, b: 1 })

      const hybrid = new HybridDb(this.local, this.remote)
      hybrid.addCollection("scratch", {
        sortUpserts(u1, u2) {
          if (u1.b < u2.b) {
            return -1
          } else {
            return 1
          }
        }
      })

      const upserts = []
      this.rc.upsert = (doc, base, success, error) => {
        upserts.push(doc)
        return success()
      }

      return hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)

          assert.deepEqual(_.pluck(upserts, "a"), [2, 1])
          return done()
        })
      }, fail)
    })

    it("does not resolve upsert if data changed, but changes base", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })

      // Override pending upserts to change doc right before returning
      const oldPendingUpserts = this.lc.pendingUpserts
      this.lc.pendingUpserts = (success) => {
        return oldPendingUpserts.call(this.lc, (upserts) => {
          // Alter row
          this.lc.upsert({ _id: "1", a: 2 })
          return success(upserts)
        })
      }

      return this.hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 1)
          assert.deepEqual(data[0].doc, { _id: "1", a: 2 })
          assert.deepEqual(data[0].base, { _id: "1", a: 1 })

          return this.rc.pendingUpserts(function (data) {
            assert.deepEqual(data[0].doc, { _id: "1", a: 1 })
            assert.isNull(data[0].base)
            return done()
          })
        })
      }, fail)
    })

    it("caches new upserted value", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })

      // Override remote upsert to change returned doc
      this.rc.upsert = (docs, bases, success) => success({ _id: "1", a: 2 })

      return this.hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)

          return this.lc.findOne({ _id: "1" }, {}, function (data) {
            assert.deepEqual(data, { _id: "1", a: 2 })
            return done()
          })
        })
      }, fail)
    })

    it("upload applies pending removes", function (done) {
      this.lc.seed({ _id: "1", a: 1 })
      this.rc.seed({ _id: "1", a: 1 })
      this.hc.remove("1")

      return this.hybrid.upload(() => {
        return this.lc.pendingRemoves((data) => {
          assert.equal(data.length, 0)

          return this.rc.pendingRemoves(function (data) {
            assert.deepEqual(data, ["1"])
            return done()
          })
        })
      }, fail)
    })

    it("keeps upserts and deletes if failed to apply", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })
      this.lc.upsert({ _id: "2", a: 2 })
      this.lc.seed({ _id: "3", a: 3 })
      this.rc.seed({ _id: "3", a: 3 })
      this.hc.remove("3")

      this.rc.upsert = (docs, bases, success, error) => error(new Error("fail"))

      this.rc.remove = (id, success, error) => error(new Error("fail"))

      return this.hybrid.upload(
        () => assert.fail(),
        () => {
          return this.lc.pendingUpserts((data) => {
            assert.equal(data.length, 2)
            this.lc.pendingRemoves(function (data) {
              assert.equal(data.length, 1)
              return assert.equal(data[0], "3")
            })
            return done()
          })
        }
      )
    })

    it("removes upsert if fails with 410 (gone) and continue", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })

      this.rc.upsert = (docs, bases, success, error) => error({ status: 410 })

      return this.hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)
          return this.lc.pendingRemoves((data) => {
            assert.equal(data.length, 0)
            return this.lc.findOne(
              { _id: "1" },
              function (data) {
                assert.isNull(data)
                return done()
              },
              fail
            )
          }, fail)
        }, fail)
      }, fail)
    })

    it("removes upsert if fails with 403 (permission) and fail", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })

      this.rc.upsert = (docs, bases, success, error) => error({ status: 403 })

      return this.hybrid.upload(fail, () => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)
          return this.lc.pendingRemoves((data) => {
            assert.equal(data.length, 0)
            return this.lc.findOne(
              { _id: "1" },
              function (data) {
                assert.isNull(data)
                return done()
              },
              fail
            )
          }, fail)
        }, fail)
      })
    })

    it("removes document if remove fails with 403 (permission) and fail", function (done) {
      this.lc.seed({ _id: "1", a: 1 })
      this.hc.remove("3")

      this.rc.remove = (id, success, error) => error({ status: 403 })

      return this.hybrid.upload(
        () => assert.fail(),
        () => {
          return this.lc.pendingUpserts((data) => {
            assert.equal(data.length, 0, "Should have zero upserts")
            return this.lc.pendingRemoves((data) => {
              assert.equal(data.length, 0, "Should have zero removes")
              return this.lc.findOne({ _id: "1" }, function (data) {
                assert.equal(data.a, 1)
                return done()
              })
            })
          })
        }
      )
    })

    it("removes upsert if returns null", function (done) {
      this.lc.upsert({ _id: "1", a: 1 })

      this.rc.upsert = (docs, bases, success, error) => success(null)

      return this.hybrid.upload(() => {
        return this.lc.pendingUpserts((data) => {
          assert.equal(data.length, 0)
          return this.lc.pendingRemoves((data) => {
            assert.equal(data.length, 0)
            return this.lc.findOne(
              { _id: "1" },
              function (data) {
                assert.isNull(data)
                return done()
              },
              fail
            )
          }, fail)
        }, fail)
      }, fail)
    })

    it("upserts to local db", function (done) {
      this.hc.upsert({ _id: "1", a: 1 })
      return this.lc.pendingUpserts(function (data) {
        assert.equal(data.length, 1)
        return done()
      })
    })

    it("passes up error from local db", function (done) {
      const oldUpsert = this.lc.upsert
      try {
        this.lc.upsert = function (docs, bases, success, error) {
          if (_.isFunction(bases)) {
            error = success
            success = bases
          }
          return error("FAIL")
        }
      } catch (error) {}

      return this.hc.upsert(
        { _id: "1", a: 1 },
        () => done(new Error("Should not call success")),
        (err) => done()
      )
    })

    it("upserts to local db with base version", function (done) {
      this.hc.upsert({ _id: "1", a: 2 }, { _id: "1", a: 1 })
      return this.lc.pendingUpserts(function (data) {
        assert.equal(data.length, 1)
        assert.equal(data[0].doc.a, 2)
        assert.equal(data[0].base.a, 1)
        return done()
      })
    })

    return it("removes to local db", function (done) {
      this.lc.seed({ _id: "1", a: 1 })
      this.hc.remove("1")
      return this.lc.pendingRemoves(function (data) {
        assert.equal(data.length, 1)
        return done()
      })
    })
  })

  return context("cacheFind: false, interim: false", function () {
    beforeEach(function () {
      this.local = new MemoryDb()
      this.remote = new MemoryDb()
      this.hybrid = new HybridDb(this.local, this.remote)

      this.local.addCollection("scratch")
      this.lc = this.local.scratch

      this.remote.addCollection("scratch")
      this.rc = this.remote.scratch

      this.hybrid.addCollection("scratch")
      this.hc = this.hybrid.scratch

      // Seed some remote data
      this.rc.seed({ _id: "1", a: 3 })
      return this.rc.seed({ _id: "2", a: 4 })
    })

    it("find uses remote", function (done) {
      return this.hc.find({}, { cacheFind: false, interim: false }).fetch((data) => {
        assert.deepEqual(_.pluck(data, "a"), [3, 4])
        return done()
      })
    })

    it("find does not cache results", function (done) {
      return this.hc.find({}, { cacheFind: false, interim: false }).fetch((data) => {
        return this.lc.find({}).fetch((data) => {
          assert.equal(data.length, 0)
          return done()
        })
      })
    })

    it("find respects local upserts", function (done) {
      this.lc.upsert({ _id: "1", a: 9 })

      return this.hc.find({}, { cacheFind: false, interim: false, sort: ["_id"] }).fetch((data) => {
        assert.deepEqual(_.pluck(data, "a"), [9, 4])
        return done()
      })
    })

    it("find respects local removes", function (done) {
      this.lc.remove("1")

      return this.hc.find({}, { cacheFind: false, interim: false }).fetch((data) => {
        assert.deepEqual(_.pluck(data, "a"), [4])
        return done()
      })
    })

    it("findOne without _id selector uses remote", function (done) {
      return this.hc.findOne({}, { cacheFindOne: false, interim: false, sort: ["_id"] }, (data) => {
        assert.deepEqual(data, { _id: "1", a: 3 })
        return done()
      })
    })

    it("findOne without _id selector respects local upsert", function (done) {
      this.lc.upsert({ _id: "1", a: 9 })
      return this.hc.findOne({}, { cacheFindOne: false, interim: false, sort: ["_id"] }, (data) => {
        assert.deepEqual(data, { _id: "1", a: 9 })
        return done()
      })
    })

    it("findOne without _id selector respects local remove", function (done) {
      this.lc.remove("1")

      return this.hc.findOne({}, { cacheFindOne: false, sort: ["_id"] }, (data) => {
        assert.deepEqual(data, { _id: "2", a: 4 })
        return done()
      })
    })

    it("findOne with _id selector uses remote", function (done) {
      return this.hc.findOne({ _id: "1" }, { cacheFindOne: false, sort: ["_id"] }, (data) => {
        assert.deepEqual(data, { _id: "1", a: 3 })
        return done()
      })
    })

    it("findOne with _id selector respects local upsert", function (done) {
      this.lc.upsert({ _id: "1", a: 9 })
      return this.hc.findOne({ _id: "1" }, { cacheFindOne: false, interim: false, sort: ["_id"] }, (data) => {
        assert.deepEqual(data, { _id: "1", a: 9 })
        return done()
      })
    })

    return it("findOne with _id selector respects local remove", function (done) {
      this.lc.remove("1")

      return this.hc.findOne({ _id: "1" }, { cacheFindOne: false, interim: false, sort: ["_id"] }, (data) => {
        assert.isNull(data)
        return done()
      })
    })
  })
})

// Only use this test if cacheUpsert is used in the future
// it "upload success removes from local", (done) ->
//   @lc.upsert({ _id:"1", a:9 })
//   @hybrid.upload =>
//     # Not pending locally
//     @lc.pendingRemoves (data) =>
//       assert.equal data.length, 0

//       # Pending remotely
//       @rc.pendingUpserts (data) =>
//         assert.deepEqual _.pluck(_.pluck(data, 'doc'), "a"), [9]

//         # Not cached locally
//         @lc.find({}).fetch (data) =>
//           assert.equal data.length, 0
//           done()
//         , fail
//       , fail
//   , fail
