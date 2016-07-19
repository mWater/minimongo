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

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)

