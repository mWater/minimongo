chai = require 'chai'
assert = chai.assert
WebSQLDb = require "../lib/WebSQLDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'
async = require 'async'

describe 'WebSQLDb', ->
  @timeout(5000)
  before (done) ->
    @db = new WebSQLDb { namespace: "db.scratch" }, =>
      @db.addCollection 'scratch', =>
        done()

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

describe 'WebSQLDb storage', ->
  beforeEach (done) ->
    @db = new WebSQLDb { namespace: "db.scratch" }, =>
      @db.removeCollection 'scratch', =>
        @db.addCollection 'scratch', =>
          done()

  it "retains items", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new WebSQLDb { namespace: "db.scratch" }, =>
        db2.addCollection 'scratch', =>
          db2.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, "Alice"
            done()

  it "retains upserts", (done) ->
    @db.scratch.upsert { _id:1, a:"Alice" }, =>
      db2 = new WebSQLDb { namespace: "db.scratch" }, =>
        db2.addCollection 'scratch', =>
          db2.scratch.find({}).fetch (results) ->
            db2.scratch.pendingUpserts (upserts) ->
              assert.deepEqual results, upserts
              done()

  it "retains removes", (done) ->
    @db.scratch.seed { _id:1, a:"Alice" }, =>
      @db.scratch.remove 1, =>
        db2 = new WebSQLDb { namespace: "db.scratch" }, =>
          db2.addCollection 'scratch', =>
            db2.scratch.pendingRemoves (removes) ->
              assert.deepEqual removes, [1]
              done()

  it "inserts 1000 documents at once", (done) ->
    @timeout(30000)
    docs = []
    for i in [0...1000]
      docs.push { lat: i, lng: i+1, timestamp: new Date().toISOString() }

    @db.scratch.upsert docs, =>
      @db.scratch.find({}).fetch (results) =>
        assert.equal results.length, 1000
        done()

  # context "10000 documents", ->
  #   @timeout(30000)

  #   beforeEach (done) ->
  #     docs = []
  #     for i in [0...10000]
  #       docs.push { lat: i, lng: i+1, timestamp: new Date().toISOString() }

  #     @db.scratch.upsert docs, =>
  #       done()

  #   it "retrieves them 50 times", (done) ->
  #     async.times 50, (n, cb) =>
  #       @db.scratch.find({}).fetch (results) =>
  #         assert.equal results.length, 10000
  #         cb()
  #     , => done()

  # it "inserts 50 documents in series", (done) ->
  #   @timeout(30000)
  #   docs = []
  #   for i in [0...50]
  #     docs.push { lat: i, lng: i+1, timestamp: new Date().toISOString() }

  #   async.eachSeries docs, (doc, cb) =>
  #     @db.scratch.upsert doc, =>
  #       cb()
  #     , cb
  #   , =>
  #     done()
      



