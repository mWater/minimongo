chai = require 'chai'
assert = chai.assert
WebSQLDb = require "../lib/WebSQLDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'
async = require 'async'

OldWebSQLDb = require './v2/WebSQLDb'

error = (err) ->
  console.log err
  assert.fail(JSON.stringify(err))

describe 'WebSQLDb', ->
  @timeout(5000)

  before (done) ->
    @reset = (done) =>
      new WebSQLDb { namespace: "db.scratch" }, (db) =>
        @db = db
        @db.removeCollection 'scratch', =>
          @db.addCollection 'scratch', =>
            @col = @db.scratch
            done()
    @reset(done)

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

describe 'WebSQLDb storage', ->
  beforeEach (done) ->
    new WebSQLDb { namespace: "db.scratch" }, (db) =>
      @db = db
      @db.removeCollection 'scratch', =>
        @db.addCollection 'scratch', ->
          done()

  it "retains items", (done) ->
    @db.scratch.upsert { _id:"1", a:"Alice" }, ->
      new WebSQLDb { namespace: "db.scratch" }, (db2) ->
        db2.addCollection 'scratch', ->
          db2.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, "Alice"
            done()

  it "retains upserts", (done) ->
    @db.scratch.cacheOne { _id:"1", a:"Alice" }, =>
      @db.scratch.upsert { _id:"1", a:"Bob" }, ->
        new WebSQLDb { namespace: "db.scratch" }, (db2) ->
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
        new WebSQLDb { namespace: "db.scratch" }, (db2) ->
          db2.addCollection 'scratch', ->
            db2.scratch.pendingRemoves (removes) ->
              assert.deepEqual removes, ["1"]
              done()

  it "inserts 1000 documents at once", (done) ->
    @timeout(30000)
    docs = []
    for i in [0...1000]
      docs.push { lat: i, lng: i+1, timestamp: new Date().toISOString() }

    @db.scratch.upsert docs, =>
      @db.scratch.find({}).fetch (results) ->
        assert.equal results.length, 1000
        done()
      , error
    , error

# describe 'WebSQLDb upgrade', ->
#   it "retains items", (done) ->
#     new OldWebSQLDb { namespace: "db.scratch" }, (olddb) =>
#       olddb.addCollection 'scratch', =>
#         olddb.scratch.upsert { _id:"1", a:"Alice" }, =>
#           new WebSQLDb { namespace: "db.scratch" }, (newdb) =>
#             newdb.addCollection 'scratch', =>
#               newdb.scratch.find({}).fetch (results) ->
#                 assert.equal results[0].a, "Alice"
#                 done()
