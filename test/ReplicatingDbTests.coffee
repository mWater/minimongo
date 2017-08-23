chai = require 'chai'
assert = chai.assert
ReplicatingDb = require "../src/ReplicatingDb"
MemoryDb = require "../src/MemoryDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'
async = require 'async'

error = (err) ->
  console.log err
  assert.fail(JSON.stringify(err))

describe 'ReplicatingDb', ->
  describe "passes queries", ->
    before (done) ->
      @reset = (done) =>
        @masterDb = new MemoryDb()
        @replicaDb = new MemoryDb()

        @masterDb.addCollection("scratch")
        @replicaDb.addCollection("scratch")

        @db = new ReplicatingDb(@masterDb, @replicaDb)
        @db.addCollection("scratch")
        @col = @db.scratch
        done()
      @reset(done)

    db_queries.call(this)

  describe "passes caching", ->
    before (done) ->
      @reset = (done) =>
        @masterDb = new MemoryDb()
        @replicaDb = new MemoryDb()

        @masterDb.addCollection("scratch")
        @replicaDb.addCollection("scratch")

        @db = new ReplicatingDb(@masterDb, @replicaDb)
        @db.addCollection("scratch")
        @col = @db.scratch
        done()
      @reset(done)

    db_caching.call(this)

  describe "passes caching with find on replica", ->
    before (done) ->
      @reset = (done) =>
        @masterDb = new MemoryDb()
        @replicaDb = new MemoryDb()

        @masterDb.addCollection("scratch")
        @replicaDb.addCollection("scratch")

        @db = new ReplicatingDb(@masterDb, @replicaDb)
        @db.addCollection("scratch")
        @col = @db.scratch

        # Use replica to ensure that caching works on replica too
        @db.scratch.find = @replicaDb.scratch.find.bind(@replicaDb.scratch)
        @db.scratch.findOne = @replicaDb.scratch.findOne.bind(@replicaDb.scratch)

        done()
      @reset(done)

    db_caching.call(this)
