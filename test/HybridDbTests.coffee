_ = require 'lodash'
chai = require 'chai'
assert = chai.assert
sinon = require 'sinon'
MemoryDb = require "../lib/MemoryDb"
HybridDb = require "../lib/HybridDb"
db_queries = require "./db_queries"

# Note: Assumes local db is synchronous!
fail = ->
  throw new Error("failed")

describe 'HybridDb', ->
  before (done) ->
    @reset = (done) =>
      @local = new MemoryDb()
      @remote = new MemoryDb()
      @hybrid = new HybridDb(@local, @remote)

      @local.addCollection("scratch")
      @lc = @local.scratch

      @remote.addCollection("scratch")
      @rc = @remote.scratch

      @hybrid.addCollection("scratch")
      @hc = @hybrid.scratch
      @col = @hc
      done()

    @reset(done)

  describe "passes queries", ->
    db_queries.call(this)

  context "resets each time", ->
    beforeEach (done) -> @reset(done)

    describe "interim:true (default)", ->
      it "find gives only one result if data unchanged", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:1)
        @rc.seed(_id:"2", a:2)

        calls = 0
        @hc.find({}).fetch (data) ->
          calls += 1
          assert.equal data.length, 2
          assert.equal calls, 1
          done()
        , fail

      it "find gives results twice if remote gives different answer", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.find({}).fetch (data) ->
          assert.equal data.length, 2
          calls = calls + 1
          if calls >= 2
            done()
        , fail

      it "find gives results once if remote gives same answer with sort differences", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.find = ->
          return fetch: (success) ->
            success([{_id:"2", a:2}, {_id:"1", a:1}])

        @hc.find({}).fetch (data) ->
          assert.equal data.length, 2
          done()
        , fail

      it "local upserts are respected", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.upsert(_id:"2", a:2)

        @rc.seed(_id:"1", a:1)
        @rc.seed(_id:"2", a:4)

        @hc.findOne { _id: "2"}, (doc) ->
          assert.deepEqual doc, { _id: "2", a: 2 }
          done()
        , fail

    describe "cacheFind: true (default)", ->
      it "find performs full field remote queries", (done) ->
        @rc.seed(_id:"1", a:1, b:11)
        @rc.seed(_id:"2", a:2, b:12)

        @hc.find({}, { fields: { b:0 } }).fetch (data) =>
          if data.length == 0
            return
          assert.isUndefined data[0].b
          @lc.findOne { _id: "1" }, (doc) ->
            assert.equal doc.b, 11
            done()

      it "caches remote data", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:2)

        calls = 0
        @hc.find({}).fetch (data) =>
          assert.equal data.length, 2
          calls = calls + 1

          # After second call, check that local collection has latest
          if calls == 2
            @lc.find({}).fetch (data) ->
              assert.equal data.length, 2
              assert.deepEqual _.pluck(data, 'a'), [3,2]
              done()

    describe "cacheFindOne: true (default)", ->
      it "findOne performs full field remote queries", (done) ->
        @rc.seed(_id:"1", a:1, b:11)
        @rc.seed(_id:"2", a:2, b:12)

        @hc.findOne { _id: "1" }, { fields: { b:0 } }, (doc) =>
          assert.isUndefined doc.b
          @lc.findOne { _id: "1" }, (doc) ->
            assert.equal doc.b, 11
            done()

      it "findOne gives results twice if remote gives different answer", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1"}, (data) ->
          calls = calls + 1
          if calls == 1
            assert.deepEqual data, { _id : "1", a:1 }
          if calls >= 2
            assert.deepEqual data, { _id : "1", a:3 }
            done()
        , fail

      it "findOne gives local results once if remote fails", (done) ->
        @lc.seed(_id:"1", a:1)

        @rc.findOne = (selector, options = {}, success, error) ->
          error(new Error("fail"))
        @rc.find = (selector, options) ->
          return { fetch: (success, error) ->
            error()
          }

        @hc.findOne { _id: "1"}, (data) ->
          assert.equal data.a, 1
          done()
        , fail

      it "findOne gives local results selected not by _id once if remote fails", (done) ->
        @lc.seed(_id:"1", a:1)

        @rc.findOne = (selector, options = {}, success, error) ->
          error(new Error("fail"))
        @rc.find = (selector, options) ->
          return { fetch: (success, error) ->
            error()
          }

        @hc.findOne { a: 1 }, (data) ->
          console.log data
          assert.equal data.a, 1
          done()
        , fail

      it "findOne gives local results once if remote fails", (done) ->
        called = 0
        @rc.findOne = (selector, options = {}, success, error) ->
          called = called + 1
          error(new Error("fail"))
        @rc.find = (selector, options) ->
          return { fetch: (success, error) ->
            called = called + 1
            error()
          }

        @hc.findOne { _id: "xyz"}, (data) ->
          assert.equal data, null
          assert.equal called, 1
          done()
        , fail

      it "findOne keeps local cache updated on remote change", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1"}, (data) =>
          calls = calls + 1
          if calls == 1
            assert.deepEqual data, { _id : "1", a:1 }
          if calls >= 2
            assert.deepEqual data, { _id : "1", a:3 }
            @lc.find({}, {}).fetch (data) ->
              assert.deepEqual _.pluck(data, 'a'), [3,2]
            done()
        , fail

    describe "interim: false", ->
      it "find gives final results only", (done) ->
        @lc.upsert(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.find({}, {interim: false}).fetch (data) ->
          assert.equal data.length, 2
          assert.equal data[0].a, 1
          assert.equal data[1].a, 4
          done()
        , fail

    describe "cacheFind: false", ->
      it "find performs partial field remote queries", (done) ->
        sinon.spy(@rc, "find")
        @rc.seed(_id:"1", a:1, b:11)
        @rc.seed(_id:"2", a:2, b:12)

        @hc.find({}, { fields: { b:0 }, cacheFind: false }).fetch (data) =>
          if data.length == 0
            return
          assert.isUndefined data[0].b
          assert.deepEqual @rc.find.firstCall.args[1].fields, { b:0 }
          @rc.find.restore()
          done()

      it "does not cache remote data", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:2)

        calls = 0
        @hc.find({}, {cacheFind: false}).fetch (data) =>
          assert.equal data.length, 2
          calls = calls + 1

          # After second call, check that local collection is unchanged
          if calls == 2
            @lc.find({}).fetch (data) ->
              assert.equal data.length, 2
              assert.deepEqual _.pluck(data, 'a'), [1,2]
              done()

    describe "cacheFindOne: false", ->
      it "findOne performs partial field remote queries", (done) ->
        sinon.spy(@rc, "find")
        @rc.seed(_id:"1", a:1, b:11)
        @rc.seed(_id:"2", a:2, b:12)

        @hc.findOne { _id: "1" }, { fields: { b:0 }, cacheFindOne: false }, (data) =>
          if data == null
            return

          assert.isUndefined data.b
          assert.deepEqual @rc.find.getCall(0).args[1].fields, { b:0 }
          @rc.find.restore()
          done()

    context "shortcut: false (default)", ->
      it "findOne calls both local and remote", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1" }, (data) ->
          calls += 1
          if calls == 1
            assert.deepEqual data, { _id : "1", a:1 }
          else
            assert.deepEqual data, { _id : "1", a:3 }
            done()
        , fail

      context "interim: false", ->
        it "findOne calls both local and remote", (done) ->
          @lc.seed(_id:"1", a:1)
          @lc.seed(_id:"2", a:2)

          @rc.seed(_id:"1", a:3)
          @rc.seed(_id:"2", a:4)

          @hc.findOne { _id: "1" }, { interim: false }, (data) ->
            assert.deepEqual data, { _id : "1", a:3 }
            done()
          , fail

      it "findOne calls remote if not found", (done) ->
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1"}, { shortcut: true }, (data) ->
          assert.deepEqual data, { _id : "1", a:3 }
          done()
        , fail

    context "shortcut: true", ->
      it "findOne only calls local if found", (done) ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1" }, { shortcut: true }, (data) ->
          assert.deepEqual data, { _id : "1", a:1 }
          done()
        , fail

      it "findOne calls remote if not found", (done) ->
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

        calls = 0
        @hc.findOne { _id: "1"}, { shortcut: true }, (data) ->
          assert.deepEqual data, { _id : "1", a:3 }
          done()
        , fail

    context "cacheFind: false, interim: false", ->
      beforeEach ->
        @lc.seed(_id:"1", a:1)
        @lc.seed(_id:"2", a:2)

        @rc.seed(_id:"1", a:3)
        @rc.seed(_id:"2", a:4)

      it "find only calls remote", (done) ->
        @hc.find({}, { cacheFind: false, interim: false }).fetch (data) ->
          assert.deepEqual _.pluck(data, 'a'), [3,4]
          done()

      it "find does not cache results", (done) ->
        @hc.find({}, { cacheFind: false, interim: false }).fetch (data) =>
          @lc.find({}).fetch (data) =>
            assert.deepEqual _.pluck(data, 'a'), [1,2]
            done()

      it "find falls back to local if remote fails", (done) ->
        @rc.find = (selector, options) ->
          return { fetch: (success, error) ->
            error()
          }
        @hc.find({}, { cacheFind: false, interim: false }).fetch (data) ->
          assert.deepEqual _.pluck(data, 'a'), [1,2]
          done()

      it "find errors if useLocalOnRemoteError:false if remote fails", (done) ->
        @rc.find = (selector, options) =>
          return { fetch: (success, error) ->
            error()
          }
        @hc.find({}, { cacheFind: false, interim: false, useLocalOnRemoteError:false }).fetch (data) =>
          assert.fail()
        , (err) ->
          done()

      it "find respects local upserts", (done) ->
        @lc.upsert({ _id:"1", a:9 })

        @hc.find({}, { cacheFind: false, interim: false, sort: ['_id'] }).fetch (data) =>
          assert.deepEqual _.pluck(data, 'a'), [9,4]
          done()

      it "find respects local removes", (done) ->
        @lc.remove("1")

        @hc.find({}, { cacheFind: false, interim: false }).fetch (data) ->
          assert.deepEqual _.pluck(data, 'a'), [4]
          done()

    it "upload applies pending upserts", (done) ->
      @lc.upsert(_id:"1", a:1)
      @lc.upsert(_id:"2", a:2)

      @hybrid.upload(=>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 0

          @rc.pendingUpserts (data) ->
            assert.deepEqual _.pluck(_.pluck(data, 'doc'), 'a'), [1,2]
            done()
      , fail)

    it "does not resolve upsert if data changed, but changes base", (done) ->
      @lc.upsert(_id:"1", a:1)

      # Override pending upserts to change doc right before returning
      oldPendingUpserts = @lc.pendingUpserts
      @lc.pendingUpserts = (success) =>
        oldPendingUpserts.call @lc, (upserts) =>
          # Alter row
          @lc.upsert(_id:"1", a:2)
          success(upserts)

      @hybrid.upload(=>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 1
          assert.deepEqual data[0].doc, { _id:"1", a:2 }
          assert.deepEqual data[0].base, { _id:"1", a:1 }

          @rc.pendingUpserts (data) ->
            assert.deepEqual data[0].doc, { _id:"1", a:1 }
            assert.isNull data[0].base
            done()
      , fail)

    it "caches new upserted value", (done) ->
      @lc.upsert(_id:"1", a:1)

      # Override remote upsert to change returned doc
      @rc.upsert = (docs, bases, success) ->
        success(_id:"1", a:2)

      @hybrid.upload(=>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 0

          @lc.findOne {_id:"1"}, {}, (data) ->
            assert.deepEqual data, { _id:"1", a:2 }
            done()
      , fail)

    it "upload applies pending removes", (done) ->
      @lc.seed(_id:"1", a:1)
      @rc.seed(_id:"1", a:1)
      @hc.remove("1")

      @hybrid.upload(=>
        @lc.pendingRemoves (data) =>
          assert.equal data.length, 0

          @rc.pendingRemoves (data) ->
            assert.deepEqual data, ["1"]
            done()
      , fail)

    it "keeps upserts and deletes if failed to apply", (done) ->
      @lc.upsert(_id:"1", a:1)
      @lc.upsert(_id:"2", a:2)
      @lc.seed(_id:"3", a:3)
      @rc.seed(_id:"3", a:3)
      @hc.remove("3")

      @rc.upsert = (docs, bases, success, error) ->
        error(new Error("fail"))

      @rc.remove = (id, success, error) ->
        error(new Error("fail"))

      @hybrid.upload(->
        assert.fail()
      , ()=>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 2
          @lc.pendingRemoves (data) ->
            assert.equal data.length, 1
            assert.equal data[0], "3"
          done()
      )

    it "removes upsert if fails with 410 (gone) and continue", (done) ->
      @lc.upsert(_id:"1", a:1)

      @rc.upsert = (docs, bases, success, error) ->
        error({ status: 410 })

      @hybrid.upload =>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 0
          @lc.pendingRemoves (data) =>
            assert.equal data.length, 0
            @lc.findOne { _id: "1"}, (data) ->
              assert.isNull data
              done()
            , fail
          , fail
        , fail
      , fail

    it "removes upsert if fails with 403 (permission) and fail", (done) ->
      @lc.upsert(_id:"1", a:1)

      @rc.upsert = (docs, bases, success, error) ->
        error({ status: 403 })

      @hybrid.upload fail, =>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 0
          @lc.pendingRemoves (data) =>
            assert.equal data.length, 0
            @lc.findOne { _id: "1"}, (data) ->
              assert.isNull data
              done()
            , fail
          , fail
        , fail

    it "removes document if remove fails with 403 (permission) and fail", (done) ->
      @lc.seed(_id:"1", a:1)
      @hc.remove("3")

      @rc.remove = (id, success, error) ->
        error({ status: 403 })

      @hybrid.upload(->
        assert.fail()
      , ()=>
        @lc.pendingUpserts (data) =>
          assert.equal data.length, 0, "Should have zero upserts"
          @lc.pendingRemoves (data) =>
            assert.equal data.length, 0, "Should have zero removes"
            @lc.findOne { _id: "1" }, (data) ->
              assert.equal data.a, 1
              done()
      )

    it "upserts to local db", (done) ->
      @hc.upsert(_id:"1", a:1)
      @lc.pendingUpserts (data) ->
        assert.equal data.length, 1
        done()

    it "upserts to local db with base version", (done) ->
      @hc.upsert({_id:"1", a:2}, {_id:"1", a:1})
      @lc.pendingUpserts (data) ->
        assert.equal data.length, 1
        assert.equal data[0].doc.a, 2
        assert.equal data[0].base.a, 1
        done()

    it "removes to local db", (done) ->
      @lc.seed(_id:"1", a:1)
      @hc.remove("1")
      @lc.pendingRemoves (data) ->
        assert.equal data.length, 1
        done()

  context "cacheFind: false, interim: false", ->
    beforeEach ->
      @local = new MemoryDb()
      @remote = new MemoryDb()
      @hybrid = new HybridDb(@local, @remote)

      @local.addCollection("scratch")
      @lc = @local.scratch

      @remote.addCollection("scratch")
      @rc = @remote.scratch

      @hybrid.addCollection("scratch")
      @hc = @hybrid.scratch

      # Seed some remote data
      @rc.seed(_id:"1", a:3)
      @rc.seed(_id:"2", a:4)

    it "find uses remote", (done) ->
      @hc.find({}, { cacheFind: false, interim: false }).fetch (data) =>
        assert.deepEqual _.pluck(data, 'a'), [3,4]
        done()

    it "find does not cache results", (done) ->
      @hc.find({}, { cacheFind: false, interim: false }).fetch (data) =>
        @lc.find({}).fetch (data) =>
          assert.equal data.length, 0
          done()

    it "find respects local upserts", (done) ->
      @lc.upsert({ _id:"1", a:9 })

      @hc.find({}, { cacheFind: false, interim: false, sort: ['_id'] }).fetch (data) =>
        assert.deepEqual _.pluck(data, 'a'), [9,4]
        done()

    it "find respects local removes", (done) ->
      @lc.remove("1")

      @hc.find({}, { cacheFind: false, interim: false }).fetch (data) =>
        assert.deepEqual _.pluck(data, 'a'), [4]
        done()

    it "findOne without _id selector uses remote", (done) ->
      @hc.findOne {}, { cacheFindOne: false, interim: false, sort: ['_id'] }, (data) =>
        assert.deepEqual data, { _id:"1", a:3 }
        done()

    it "findOne without _id selector respects local upsert", (done) ->
      @lc.upsert({ _id:"1", a:9 })
      @hc.findOne {}, { cacheFindOne: false, interim: false, sort: ['_id'] }, (data) =>
        assert.deepEqual data, { _id:"1", a:9 }
        done()

    it "findOne without _id selector respects local remove", (done) ->
      @lc.remove("1")

      @hc.findOne {}, { cacheFindOne: false, sort: ['_id'] }, (data) =>
        assert.deepEqual data, { _id: "2", a: 4 }
        done()

    it "findOne with _id selector uses remote", (done) ->
      @hc.findOne { _id: "1" }, { cacheFindOne: false, sort: ['_id'] }, (data) =>
        assert.deepEqual data, { _id:"1", a:3 }
        done()

    it "findOne with _id selector respects local upsert", (done) ->
      @lc.upsert({ _id:"1", a:9 })
      @hc.findOne { _id: "1" }, { cacheFindOne: false, interim: false, sort: ['_id'] }, (data) =>
        assert.deepEqual data, { _id:"1", a:9 }
        done()

    it "findOne with _id selector respects local remove", (done) ->
      @lc.remove("1")

      @hc.findOne { _id: "1" }, { cacheFindOne: false, interim: false, sort: ['_id'] }, (data) =>
        assert.isNull data
        done()

    # Only use this test if cacheUpsert is used in the future
    # it "upload success removes from local", (done) ->
    #   @lc.upsert({ _id:"1", a:9 })
    #   @hybrid.upload =>
    #     # Not pending locally
    #     @lc.pendingRemoves (data) =>
    #       assert.equal data.length, 0

    #       # Pending remotely
    #       @rc.pendingUpserts (data) =>
    #         assert.deepEqual _.pluck(_.pluck(data, 'doc'), "a"), [9]

    #         # Not cached locally
    #         @lc.find({}).fetch (data) =>
    #           assert.equal data.length, 0
    #           done()
    #         , fail
    #       , fail
    #   , fail
