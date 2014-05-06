chai = require 'chai'
assert = chai.assert
MemoryDb = require "../lib/MemoryDb"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'MemoryDb', ->
  before ->
    @db = new MemoryDb()

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)
