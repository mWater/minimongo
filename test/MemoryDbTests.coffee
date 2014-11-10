chai = require 'chai'
assert = chai.assert
MemoryDb = require "../lib/MemoryDb"
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
