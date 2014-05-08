chai = require 'chai'
assert = chai.assert
utils = require "../lib/utils"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'

describe 'autoselected Local Db', ->
  before (done) ->
    utils.autoselectLocalDb { namespace: "db.scratch" }, (db) =>
      @db = db
      @db.addCollection 'scratch', =>
        done()

  describe "passes queries", ->
    db_queries.call(this)

  describe "passes caching", ->
    db_caching.call(this)
