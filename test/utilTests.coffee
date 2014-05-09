chai = require 'chai'
assert = chai.assert
utils = require "../lib/utils"
db_queries = require "./db_queries"
db_caching = require "./db_caching"
_ = require 'lodash'
MemoryDb = require '../lib/MemoryDb'

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


describe 'migrated Local Db', ->
  beforeEach (done) ->
    @from = new MemoryDb()
    @to = new MemoryDb()
    @from.addCollection("a")
    @to.addCollection("a")
    done()

  it 'migrates upserts', (done) ->
    @from.a.upsert { _id: "1", x: 1 }, =>
      utils.migrateLocalDb @from, @to, =>
        @to.a.pendingUpserts (upserts) =>
          assert.deepEqual upserts, [{ _id: "1", x: 1 }]
          @from.a.pendingUpserts (upserts2) =>
            assert.equal upserts2.length, 0
          done()

  it 'migrates removes', (done) ->
    @from.a.remove "1", =>
      utils.migrateLocalDb @from, @to, =>
        @to.a.pendingRemoves (removes) =>
          assert.deepEqual removes, ["1"]
          done()

  it 'does not migrate cached', (done) ->
    @from.a.cacheOne { _id: "1", x: 1 }, =>
      utils.migrateLocalDb @from, @to, =>
        @to.a.pendingUpserts (upserts) =>
          assert.equal upserts.length, 0
          done()

  it 'only migrates collections present in both', (done) ->
    @from.addCollection("b")
    @from.b.upsert { _id: "1", x: 1 }, =>
      utils.migrateLocalDb @from, @to, =>
        assert not @to.b
        done()

