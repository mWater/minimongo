assert = require('chai').assert
RemoteDb = require "../src/RemoteDb"
db_queries = require "./db_queries"
_ = require 'lodash'

# @col should be a collection called with fields:
# "_id" as string, "a" as string, "b" as integer, "c" as JSON and "geo" as GeoJSON
# @reset  should remove all rows from the scratch table and then call the callback
# passed to it.
exports.runTests = ->
  describe 'RemoteDb', ->
    @timeout(10000)

    # Check that it passes all normal queries
    describe "passes queries", ->
      db_queries.call(this)

    describe "merging", ->
      beforeEach (done) -> @reset(done)

      it "merges changes with base specified", (done) ->
        base = { _id: "1", a: "1", b: 1 }

        @col.upsert base, (baseDoc) =>
          change1 = _.cloneDeep(baseDoc)
          change1.a = "2"

          change2 = _.cloneDeep(baseDoc)
          change2.b = 2

          @col.upsert change1, base, (doc1) =>
            assert.equal doc1.a, "2"

            @col.upsert change2, base, (doc2) =>
              assert.equal doc2.a, "2", "Should merge returned document"
              assert.equal doc2.b, 2, "Should merge returned document"

              # Should merge on server permanently
              @col.findOne { _id: "1" }, (doc3) ->
                assert.equal doc2.a, "2", "Should merge documents"
                assert.equal doc2.b, 2, "Should merge documents"
                done()

      it "overrides changes with no base specified", (done) ->
        base = { _id: "1", a: "1", b: 1 }

        @col.upsert base, (baseDoc) =>
          change1 = _.cloneDeep(baseDoc)
          change1.a = "2"

          change2 = _.cloneDeep(baseDoc)
          change2.b = 2

          @col.upsert change1, base, (doc1) =>
            assert.equal doc1.a, "2"

            @col.upsert change2, null, (doc2) ->
              assert.equal doc2.a, "1", "Should not merge returned document"
              assert.equal doc2.b, 2, "Should keep new value"
              done()
