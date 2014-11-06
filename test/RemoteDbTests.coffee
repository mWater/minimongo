assert = require('chai').assert
RemoteDb = require "../lib/RemoteDb"
db_queries = require "./db_queries"
_ = require 'lodash'

# remoteDb should have a collection called with fields:
# "_id" as string, "a" as string, "b" as integer, "c" as JSON and "geo" as GeoJSON
# resetDatabase should remove all rows from the scratch table and then call the callback
# passed to it.
exports.runTests = (remoteDb, resetDatabase) ->
  describe 'RemoteDb', ->
    @timeout(60000)
    beforeEach (done) ->
      resetDatabase(done)

    # Check that it passes all normal queries
    describe "passes queries", ->
      db_queries.call(this)

    it "merges changes", (done) ->
      base = { _id: "1", a: "1", b: 1 }

      remoteDb.upsert base, (baseDoc) =>
        change1 = _.cloneDeep(baseDoc)
        change1.a = "2"

        change2 = _.cloneDeep(baseDoc)
        change2.b = 2

        remoteDb.upsert change1, base, (doc1) =>
          assert.equal doc1.a, "2"

          remoteDb.upsert change2, base (doc2) =>
            assert.equal doc2.a, "2", "Should merge returned document"
            assert.equal doc2.b, 2, "Should merge returned document"

            # Should merge on server permanently
            remoteDb.findOne { _id: "1" }, (doc3) =>
              assert.equal doc2.a, "2", "Should merge documents"
              assert.equal doc2.b, 2, "Should merge documents"
