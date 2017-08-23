chai = require 'chai'
assert = chai.assert
MemoryDb = require "../src/MemoryDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'MemoryDb', ->
  before (done) ->
    @reset = (done) =>
      @db = new MemoryDb()
      @db.addCollection("scratch")
      @col = @db.scratch
      done()
    @reset(done)

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

  describe "safety", ->
    before ->
      @setupSafety = (type) ->
        @db = new MemoryDb({ safety: type })
        @db.addCollection("scratch")
        @col = @db.scratch

    describe "default (clone)", ->
      beforeEach ->
        @setupSafety()

      it "find returns different copy", (done) ->
        row = { _id: "1", a: 'apple' }
        @col.cache [row], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert row != results[0]
            done()

      it "upsert is a clone", (done) ->
        row = { _id: "1", a: 'apple' }
        @col.upsert [row], =>
          row.a = "banana"
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, "apple"
            done()

    describe "freeze", ->
      beforeEach ->
        @setupSafety("freeze")

      it "upsert is a clone", (done) ->
        row = { _id: "1", a: 'apple' }
        @col.upsert [row], =>
          row.a = "banana"
          assert.equal row.a, "banana"
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, "apple"
            done()

      it "find returns frozen", (done) ->
        row = { _id: "1", a: 'apple' }
        @col.upsert [row], =>
          @col.find({}).fetch (results) ->
            assert row != results[0], "Different row"
            results[0].a = "banana"
            assert.equal results[0].a, "apple"
            done()

