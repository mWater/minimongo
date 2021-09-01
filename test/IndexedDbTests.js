chai = require 'chai'
assert = chai.assert
IndexedDb = require "../src/IndexedDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'IndexedDb', ->
  before (done) ->
    @reset = (done) =>
      @db = new IndexedDb { namespace: "db.scratch" }, =>
        @db.removeCollection 'scratch', =>
          @db.addCollection 'scratch', =>
            @col = @db.scratch
            done()
    @reset(done)

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

describe 'IndexedDb storage', ->
  beforeEach (done) ->
    @db = new IndexedDb { namespace: "db.scratch" }, =>
      @db.removeCollection 'scratch', =>
        @db.addCollection 'scratch', ->
          done()

  it "retains items", (done) ->
    @db.scratch.upsert { _id:"1", a:"Alice" }, ->
      db2 = new IndexedDb { namespace: "db.scratch" }, ->
        db2.addCollection 'scratch', ->
          db2.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, "Alice"
            done()

  it "retains upserts", (done) ->
    @db.scratch.cacheOne { _id:"1", a:"Alice" }, =>
      @db.scratch.upsert { _id:"1", a:"Bob" }, ->
        db2 = new IndexedDb { namespace: "db.scratch" }, ->
          db2.addCollection 'scratch', ->
            db2.scratch.find({}).fetch (results) ->
              assert.deepEqual results, [{ _id:"1", a:"Bob" }]
              db2.scratch.pendingUpserts (upserts) ->
                assert.equal upserts.length, 1
                assert.deepEqual upserts[0].doc, { _id:"1", a:"Bob" }
                assert.deepEqual upserts[0].base, { _id:"1", a:"Alice" }
                done()

  it "retains removes", (done) ->
    @db.scratch.seed { _id:"1", a:"Alice" }, =>
      @db.scratch.remove "1", ->
        db2 = new IndexedDb { namespace: "db.scratch" }, ->
          db2.addCollection 'scratch', ->
            db2.scratch.pendingRemoves (removes) ->
              assert.deepEqual removes, ["1"]
              done()
