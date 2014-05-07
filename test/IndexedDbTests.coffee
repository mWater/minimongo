chai = require 'chai'
assert = chai.assert
IndexedDb = require "../lib/IndexedDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'IndexedDb', ->
  before (done) ->
    @db = new IndexedDb { namespace: "db.scratch" }, =>
      @db.addCollection 'scratch', =>
        done()

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

describe 'IndexedDb storage', ->
  beforeEach (done) ->
    @db = new IndexedDb { namespace: "db.scratch" }, =>
      @db.removeCollection 'scratch', =>
        @db.addCollection 'scratch', =>
          done()

  it "retains items", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new IndexedDb { namespace: "db.scratch" }, =>
        db2.addCollection 'scratch', =>
          db2.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, "Alice"
            done()

  it "retains upserts", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new IndexedDb { namespace: "db.scratch" }, =>
        db2.addCollection 'scratch', =>
          db2.scratch.find({}).fetch (results) ->
            db2.scratch.pendingUpserts (upserts) ->
              assert.deepEqual results, upserts
              done()

  it "retains removes", (done) ->
    @db.scratch.seed { _id:1, a:"Alice" }, =>
      @db.scratch.remove 1, =>
        db2 = new IndexedDb { namespace: "db.scratch" }, =>
          db2.addCollection 'scratch', =>
            db2.scratch.pendingRemoves (removes) ->
              assert.deepEqual removes, [1]
              done()
