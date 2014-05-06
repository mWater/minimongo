chai = require 'chai'
assert = chai.assert
LocalDb = require "../lib/LocalDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'LocalDb', ->
  before ->
    @db = new LocalDb()
    @db.addCollection('scratch')

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

describe 'LocalDb with local storage', ->
  before ->
    @db = new LocalDb({ namespace: "db.scratch" })

  beforeEach (done) ->
    @db.removeCollection('scratch')
    @db.addCollection('scratch')
    done()

  it "retains items", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new LocalDb({ namespace: "db.scratch" })
      db2.addCollection 'scratch'
      db2.scratch.find({}).fetch (results) ->
        assert.equal results[0].a, "Alice"
        done()

  it "retains upserts", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new LocalDb({ namespace: "db.scratch" })
      db2.addCollection 'scratch'
      db2.scratch.find({}).fetch (results) ->
        db2.scratch.pendingUpserts (upserts) ->
          assert.deepEqual results, upserts
          done()

  it "retains removes", (done) ->
    @db.scratch.seed { _id:1, a:"Alice" }, =>
      @db.scratch.remove 1, =>
        db2 = new LocalDb({ namespace: "db.scratch" })
        db2.addCollection 'scratch'
        db2.scratch.pendingRemoves (removes) ->
          assert.deepEqual removes, [1]
          done()

describe 'LocalDb without local storage', ->
  before ->
    @db = new LocalDb()

  beforeEach (done) ->
    @db.removeCollection('scratch')
    @db.addCollection('scratch')
    done()

  it "does not retain items", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new LocalDb()
      db2.addCollection 'scratch'
      db2.scratch.find({}).fetch (results) ->
        assert.equal results.length, 0
        done()

  it "does not retain upserts", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new LocalDb()
      db2.addCollection 'scratch'
      db2.scratch.find({}).fetch (results) ->
        db2.scratch.pendingUpserts (upserts) ->
          assert.equal results.length, 0
          done()

  it "does not retain removes", (done) ->
    @db.scratch.seed { _id:1, a:"Alice" }, =>
      @db.scratch.remove 1, =>
        db2 = new LocalDb()
        db2.addCollection 'scratch'
        db2.scratch.pendingRemoves (removes) ->
          assert.equal removes.length, 0
          done()

