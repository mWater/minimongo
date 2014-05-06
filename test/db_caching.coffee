_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

# Runs caching tests on db which must be a property of this
module.exports = ->
  describe "local database", ->
    beforeEach (done) ->
      @db.removeCollection('scratch')
      @db.addCollection('scratch')
      done()

    it 'caches rows', (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it 'cache overwrite existing', (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.cache [{ _id: 1, a: 'banana' }], {}, {}, =>
          @db.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it "cache doesn't overwrite upsert", (done) ->
      @db.scratch.upsert { _id: 1, a: 'apple' }, =>
        @db.scratch.cache [{ _id: 1, a: 'banana' }], {}, {}, =>
          @db.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "cache doesn't overwrite remove", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'delete' }], {}, {}, =>
        @db.scratch.remove 1, =>
        @db.scratch.cache [{ _id: 1, a: 'banana' }], {}, {}, =>
          @db.scratch.find({}).fetch (results) ->
            assert.equal results.length, 0
            done()

    it "cache removes missing unsorted", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 2, a: 'b' }, { _id: 3, a: 'c' }], {}, {}, =>
        @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 3, a: 'c' }], {}, {}, =>
          @db.scratch.find({}).fetch (results) ->
            assert.equal results.length, 2
            done()

    it "handles implicitly sorted ($near) with limit"
    # TODO

    it "cache removes missing filtered", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 2, a: 'b' }, { _id: 3, a: 'c' }], {}, {}, =>
        @db.scratch.cache [{ _id: 1, a: 'a' }], {_id: {$lt:3}}, {}, =>
          @db.scratch.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), [1,3]
            done()

    it "cache removes missing sorted limited", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 2, a: 'b' }, { _id: 3, a: 'c' }], {}, {}, =>
        @db.scratch.cache [{ _id: 1, a: 'a' }], {}, {sort:['_id'], limit:2}, =>
          @db.scratch.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), [1,3]
            done()

    it "cache does not remove missing sorted limited past end", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 2, a: 'b' }, { _id: 3, a: 'c' }, { _id: 4, a: 'd' }], {}, {}, =>
        @db.scratch.remove 2, =>
          @db.scratch.cache [{ _id: 1, a: 'a' }, { _id: 2, a: 'b' }], {}, {sort:['_id'], limit:2}, =>
            @db.scratch.find({}, {sort:['_id']}).fetch (results) ->
              assert.deepEqual _.pluck(results, '_id'), [1,3,4]
              done()

    it "returns pending upserts", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.upsert { _id: 2, a: 'banana' }, =>
          @db.scratch.pendingUpserts (results) =>
            assert.equal results.length, 1
            assert.equal results[0].a, 'banana'
            done()

    it "resolves pending upserts", (done) ->
      @db.scratch.upsert { _id: 2, a: 'banana' }, =>
        @db.scratch.resolveUpsert { _id: 2, a: 'banana' }, =>
          @db.scratch.pendingUpserts (results) =>
            assert.equal results.length, 0
            done()

    it "resolves pending upserts with server-added fields", (done) ->
      @db.scratch.upsert { _id: 2, a: 'banana' }, =>
        @db.scratch.resolveUpsert { _id: 2, a: 'banana', _rev: 1, created: { on: "2013", by: "test" }, modified: { on: "2013", by: "test" } }, =>
          @db.scratch.pendingUpserts (results) =>
            assert.equal results.length, 0
            done()

    it "retains changed pending upserts", (done) ->
      @db.scratch.upsert { _id: 2, a: 'banana' }, =>
        @db.scratch.upsert { _id: 2, a: 'banana2' }, =>
          @db.scratch.resolveUpsert { _id: 2, a: 'banana' }, =>
            @db.scratch.pendingUpserts (results) =>
              assert.equal results.length, 1
              assert.equal results[0].a, 'banana2'
              done()

    it "removes pending upserts", (done) ->
      @db.scratch.upsert { _id: 2, a: 'banana' }, =>
        @db.scratch.remove 2, =>
          @db.scratch.pendingUpserts (results) =>
            assert.equal results.length, 0
            done()

    it "returns pending removes", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.remove 1, =>
          @db.scratch.pendingRemoves (results) =>
            assert.equal results.length, 1
            assert.equal results[0], 1
            done()

    it "resolves pending removes", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.remove 1, =>
          @db.scratch.resolveRemove 1, =>
            @db.scratch.pendingRemoves (results) =>
              assert.equal results.length, 0
              done()

    it "seeds", (done) ->
      @db.scratch.seed { _id: 1, a: 'apple' }, =>
        @db.scratch.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it "does not overwrite existing", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'banana' }], {}, {}, =>
        @db.scratch.seed { _id: 1, a: 'apple' }, =>
          @db.scratch.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it "does not add removed", (done) ->
      @db.scratch.cache [{ _id: 1, a: 'apple' }], {}, {}, =>
        @db.scratch.remove 1, =>
          @db.scratch.seed { _id: 1, a: 'apple' }, =>
            @db.scratch.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()


