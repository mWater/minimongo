_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

# Runs caching tests on @col which must be a collection (with a:<string>, b:<integer>, c:<json>, geo:<geojson>)
# @reset(done) must truncate the collection
module.exports = ->
  describe "local database", ->
    beforeEach (done) ->
      @reset(done)

    it 'caches row', (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it 'caches rows', (done) ->
      rows = [
        { _id: "1", a: 'apple' }
        { _id: "2", a: 'banana' }
        { _id: "3", a: 'orange' }
        { _id: "4", a: 'kiwi' }
      ]
      @col.cache rows, {}, {}, =>
        @col.find({}).fetch (results) ->
          assert.equal results.length, 4
          done()

    it 'caches zero rows', (done) ->
      rows = []
      @col.cache rows, {}, {}, =>
        @col.find({}).fetch (results) ->
          assert.equal results.length, 0
          done()

    it 'cache overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'banana' }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it 'cache with same _rev does not overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple', _rev: 2 }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'banana', _rev: 2 }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it 'cache with greater _rev overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple', _rev: 1 }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'banana', _rev: 2 }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it 'cache with lesser _rev does not overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple', _rev: 2 }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'banana', _rev: 1 }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "cache doesn't overwrite upsert", (done) ->
      @col.upsert { _id: "1", a: 'apple' }, =>
        @col.cache [{ _id: "1", a: 'banana' }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "cache doesn't overwrite remove", (done) ->
      @col.cache [{ _id: "1", a: 'delete' }], {}, {}, =>
        @col.remove "1", =>
          @col.cache [{ _id: "1", a: 'banana' }], {}, {}, =>
            @col.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()

    it "cache removes missing unsorted", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'a' }, { _id: "3", a: 'c' }], {}, {}, =>
          @col.find({}).fetch (results) ->
            assert.equal results.length, 2
            done()

    it "cache excludes excluded", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'a' }, { _id: "4", a: 'd' }, { _id: "5", a: "e" }], {}, { exclude: ["2", "4"] }, =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "2", "5"]
            done()

    it "handles implicitly sorted ($near) with limit"
    # TODO

    it "cache removes missing filtered", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'a' }], {_id: {$lt:"3"}}, {}, =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
            done()

    it "cache removes missing sorted limited", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.cache [{ _id: "1", a: 'a' }], {}, {sort:['_id'], limit:2}, =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
            done()

    it "cache does not remove missing sorted limited past end", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, {}, =>
        @col.remove "2", =>
          @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }], {}, {sort:['_id'], limit:2}, =>
            @col.find({}, {sort:['_id']}).fetch (results) ->
              assert.deepEqual _.pluck(results, '_id'), ["1", "3", "4"]
              done()

    it "cache does not remove missing unsorted limited", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, {}, =>
        @col.cache [{ _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, { limit: 2 }, =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3", "4"]
            done()

    it "uncache removes matching", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.uncache { a: 'b' }, =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
            done()

    it "uncache does not remove upserts", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.upsert { _id: "2", a: 'b' }, =>
          @col.uncache { a: 'b' }, =>
            @col.find({}, {sort:['_id']}).fetch (results) ->
              assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3"]
              done()

    it "uncache does not remove removes", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.remove "2", =>
          @col.uncache { a: 'b' }, =>
            @col.find({}, {sort:['_id']}).fetch (results) =>
              assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
              @col.pendingRemoves (results) =>
                assert.deepEqual results, ["2"]
                done()

    it "cacheList caches", (done) ->
      @col.cacheList [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], =>
        @col.find({}, {sort:['_id']}).fetch (results) ->
          assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3"]
          done()

    it "cacheList does not overwrite upserted", (done) ->
      @col.upsert { _id: "1", a: 'apple' }, =>
        @col.cacheList [{ _id: "1", a: 'banana' }], =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "cacheList doesn't overwrite remove", (done) ->
      @col.cacheList [{ _id: "1", a: 'delete' }], =>
        @col.remove "1", =>
          @col.cacheList [{ _id: "1", a: 'banana' }], =>
            @col.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()

    it "uncacheList removes ids", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.uncacheList ["2"], =>
          @col.find({}, {sort:['_id']}).fetch (results) ->
            assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
            done()

    it "uncacheList does not remove upserts", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.upsert { _id: "2", a: 'b' }, =>
          @col.uncacheList ["2"], =>
            @col.find({}, {sort:['_id']}).fetch (results) ->
              assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3"]
              done()

    it "uncacheList does not remove removes", (done) ->
      @col.cache [{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, =>
        @col.remove "2", =>
          @col.uncacheList ["2"], =>
            @col.find({}, {sort:['_id']}).fetch (results) =>
              assert.deepEqual _.pluck(results, '_id'), ["1", "3"]
              @col.pendingRemoves (results) =>
                assert.deepEqual results, ["2"]
                done()


    it "returns pending upserts", (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.upsert { _id: "2", a: 'banana' }, =>
          @col.pendingUpserts (results) ->
            assert.equal results.length, 1
            assert.equal results[0].doc.a, 'banana'
            assert.isNull results[0].base
            done()

    it "resolves pending upserts", (done) ->
      @col.upsert { _id: "2", a: 'banana' }, =>
        @col.resolveUpserts [{ doc: { _id: "2", a: 'banana' }, base: null }], =>
          @col.pendingUpserts (results) ->
            assert.equal results.length, 0
            done()

    it "sets base of upserts", (done) ->
      @col.cacheOne { _id: "2", a: 'apple' }, =>
        @col.upsert { _id: "2", a: 'banana' }, =>
          @col.pendingUpserts (results) ->
            assert.equal results.length, 1
            assert.equal results[0].doc.a, 'banana'
            assert.equal results[0].base.a, 'apple'
            done()

    it "keeps base on subsequent upserts", (done) ->
      @col.cacheOne { _id: "2", a: 'apple' }, =>
        @col.upsert { _id: "2", a: 'banana' }, =>
          @col.upsert { _id: "2", a: 'orange' }, =>
            @col.pendingUpserts (results) ->
              assert.equal results.length, 1
              assert.equal results[0].doc.a, 'orange'
              assert.equal results[0].base.a, 'apple'
              done()

    it "allows setting of upsert base", (done) ->
      @col.upsert { _id: "2", a: 'banana' }, { _id: "2", a: 'apple' }, =>
        @col.pendingUpserts (results) ->
          assert.equal results.length, 1
          assert.equal results[0].doc.a, 'banana'
          assert.equal results[0].base.a, 'apple'
          done()

    it "allows setting of null upsert base", (done) ->
      @col.cacheOne { _id: "2", a: 'apple' }, =>
        @col.upsert { _id: "2", a: 'banana' }, null, =>
          @col.pendingUpserts (results) ->
            assert.equal results.length, 1
            assert.equal results[0].doc.a, 'banana'
            assert.equal results[0].base, null
            done()

    it "allows multiple upserts", (done) ->
      docs = [
        { _id: "1", a: 'apple' }
        { _id: "2", a: 'banana' }
        { _id: "3", a: 'orange' }
      ]
      @col.upsert docs, =>
        @col.pendingUpserts (results) ->
          assert.deepEqual _.pluck(results, "doc"), docs
          assert.deepEqual _.pluck(results, "base"), [null, null, null]
          done()

    it "allows multiple upserts with bases", (done) ->
      docs = [
        { _id: "1", a: 'apple' }
        { _id: "2", a: 'banana' }
        { _id: "3", a: 'orange' }
      ]
      bases = [
        { _id: "1", a: 'apple2' }
        { _id: "2", a: 'banana2' }
        { _id: "3", a: 'orange2' }
      ]
      @col.upsert docs, bases, =>
        @col.pendingUpserts (results) ->
          assert.deepEqual _.pluck(results, "doc"), docs
          assert.deepEqual _.pluck(results, "base"), bases
          done()


    it "resolves multiple upserts", (done) ->
      docs = [
        { _id: "1", a: 'apple' }
        { _id: "2", a: 'banana' }
        { _id: "3", a: 'orange' }
      ]
      @col.upsert docs, =>
        @col.pendingUpserts (upserts) =>
          @col.resolveUpserts upserts, =>
            @col.pendingUpserts (results) ->
              assert.equal results.length, 0
              done()

    it "handles removed pending upserts", (done) ->
      docs = [
        { _id: "1", a: 'apple' }
        { _id: "2", a: 'banana' }
        { _id: "3", a: 'orange' }
      ]
      @col.upsert docs, =>
        @col.remove 1, =>
          @col.resolveRemove 1, =>
            @col.pendingUpserts (upserts) =>
              @col.resolveUpserts upserts, =>
                @col.pendingUpserts (results) ->
                  assert.equal results.length, 0
                  done()

    it "retains changed pending upserts but updates base", (done) ->
      @col.upsert { _id: "2", a: 'banana' }, =>
        @col.upsert { _id: "2", a: 'banana2' }, =>
          @col.resolveUpserts [{ doc: { _id: "2", a: 'banana' }, base: null }], =>
            @col.pendingUpserts (results) ->
              assert.equal results.length, 1
              assert.equal results[0].doc.a, 'banana2'
              assert.equal results[0].base.a, 'banana'
              done()

    it "removes by filter", (done) ->
      @col.upsert { _id: "1", a: 'apple' }, =>
        @col.upsert { _id: "2", a: 'banana' }, =>
          @col.upsert { _id: "3", a: 'banana' }, =>
            @col.remove { a: "banana" }, =>
              @col.pendingUpserts (results) ->
                assert.equal results.length, 1
                assert.equal results[0].doc.a, "apple"
                done()

    it "removes pending upserts", (done) ->
      @col.upsert { _id: "2", a: 'banana' }, =>
        @col.remove "2", =>
          @col.pendingUpserts (results) ->
            assert.equal results.length, 0
            done()

    it "returns pending removes", (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.remove "1", =>
          @col.pendingRemoves (results) ->
            assert.equal results.length, 1
            assert.equal results[0], 1
            done()

    it "returns pending removes that are not present", (done) ->
      @col.remove "2", =>
        @col.pendingRemoves (results) ->
          assert.equal results.length, 1
          assert.equal results[0], 2
          done()

    it "resolves pending removes", (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.remove "1", =>
          @col.resolveRemove "1", =>
            @col.pendingRemoves (results) ->
              assert.equal results.length, 0
              done()

    it "seeds", (done) ->
      @col.seed [{ _id: "1", a: 'apple' }], =>
        @col.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it "does not overwrite existing", (done) ->
      @col.cache [{ _id: "1", a: 'banana' }], {}, {}, =>
        @col.seed [{ _id: "1", a: 'apple' }], =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it "does not add removed", (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.remove "1", =>
          @col.seed [{ _id: "1", a: 'apple' }], =>
            @col.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()

    it "allows removing uncached rows", (done) ->
      @col.remove "12345", =>
        @col.pendingRemoves (results) ->
          assert.equal results.length, 1
          assert.equal results[0], "12345"
          done()

    it 'seeds rows', (done) ->
      @col.seed [{ _id: "1", a: 'apple' }], =>
        @col.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it 'seed does not overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.seed { _id: "1", a: 'banana' }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "seed doesn't overwrite upsert", (done) ->
      @col.upsert { _id: "1", a: 'apple' }, =>
        @col.seed { _id: "1", a: 'banana' }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "seed doesn't overwrite remove", (done) ->
      @col.cache [{ _id: "1", a: 'delete' }], {}, {}, =>
        @col.remove "1", =>
          @col.seed { _id: "1", a: 'banana' }, =>
            @col.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()

    it 'cache one single doc', (done) ->
      @col.cacheOne { _id: "1", a: 'apple' }, =>
        @col.find({}).fetch (results) ->
          assert.equal results[0].a, 'apple'
          done()

    it 'cache one overwrite existing', (done) ->
      @col.cache [{ _id: "1", a: 'apple' }], {}, {}, =>
        @col.cacheOne { _id: "1", a: 'banana' }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it "cache one doesn't overwrite upsert", (done) ->
      @col.upsert { _id: "1", a: 'apple' }, =>
        @col.cacheOne { _id: "1", a: 'banana' }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it "cache one doesn't overwrite remove", (done) ->
      @col.cache [{ _id: "1", a: 'delete' }], {}, {}, =>
        @col.remove "1", =>
          @col.cacheOne { _id: "1", a: 'banana' }, =>
            @col.find({}).fetch (results) ->
              assert.equal results.length, 0
              done()

    it 'cache one with same _rev does not overwrite existing', (done) ->
      @col.cacheOne { _id: "1", a: 'apple', _rev: 2 }, =>
        @col.cacheOne { _id: "1", a: 'banana', _rev: 2 }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()

    it 'cache one with greater _rev overwrite existing', (done) ->
      @col.cacheOne { _id: "1", a: 'apple', _rev: 1 }, =>
        @col.cacheOne { _id: "1", a: 'banana', _rev: 2 }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'banana'
            done()

    it 'cache one with lesser _rev does not overwrite existing', (done) ->
      @col.cacheOne { _id: "1", a: 'apple', _rev: 2 }, =>
        @col.cacheOne { _id: "1", a: 'banana', _rev: 1 }, =>
          @col.find({}).fetch (results) ->
            assert.equal results[0].a, 'apple'
            done()
