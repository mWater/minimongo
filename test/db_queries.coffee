_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

# Runs queries on db which must be a property of this
module.exports = ->
  context 'With sample rows', ->
    beforeEach (done) ->
      @db.removeCollection 'scratch', =>
        @db.addCollection 'scratch', =>
          @db.scratch.upsert { _id:"1", a:"Alice", b:1 }, =>
            @db.scratch.upsert { _id:"2", a:"Charlie", b:2 }, =>
              @db.scratch.upsert { _id:"3", a:"Bob", b:3 }, =>
                done()

    it 'finds all rows', (done) ->
      @db.scratch.find({}).fetch (results) =>
        assert.equal results.length, 3
        done()

    it 'finds all rows with options', (done) ->
      @db.scratch.find({}, {}).fetch (results) =>
        assert.equal 3, results.length
        done()

    it 'filters rows by id', (done) ->
      @db.scratch.find({ _id: "1" }).fetch (results) =>
        assert.equal 1, results.length
        assert.equal 'Alice', results[0].a
        done()

    it 'includes fields', (done) ->
      @db.scratch.find({ _id: "1" }, { fields: { a:1 }}).fetch (results) =>
        assert.deepEqual results[0], { _id: "1",  a: "Alice" }
        done()

    it 'excludes fields', (done) ->
      @db.scratch.find({ _id: "1" }, { fields: { a:0 }}).fetch (results) =>
        assert.isUndefined results[0].a
        assert.equal results[0].b, 1
        done()

    it 'finds one row', (done) ->
      @db.scratch.findOne { _id: "2" }, (result) =>
        assert.equal 'Charlie', result.a
        done()

    it 'removes item', (done) ->
      @db.scratch.remove "2", =>
        @db.scratch.find({}).fetch (results) =>
          assert.equal 2, results.length
          assert "1" in (result._id for result in results)
          assert "2" not in (result._id for result in results)
          done()

    it 'removes non-existent item', (done) ->
      @db.scratch.remove "999", =>
        @db.scratch.find({}).fetch (results) =>
          assert.equal 3, results.length
          done()

    it 'sorts ascending', (done) ->
      @db.scratch.find({}, {sort: ['a']}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
        done()

    it 'sorts descending', (done) ->
      @db.scratch.find({}, {sort: [['a','desc']]}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["2","3","1"]
        done()

    it 'limits', (done) ->
      @db.scratch.find({}, {sort: ['a'], limit:2}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()

    it 'fetches independent copies', (done) ->
      @db.scratch.findOne { _id: "2" }, (result1) =>
        @db.scratch.findOne { _id: "2" }, (result2) =>
          assert result1 != result2
          done()

    it 'adds _id to rows', (done) ->
      @db.scratch.upsert { a: 1 }, (item) =>
        assert.property item, '_id'
        assert.lengthOf item._id, 32
        done()

    it 'updates by id', (done) ->
      @db.scratch.upsert { _id:"1", a:1 }, (item) =>
        @db.scratch.upsert { _id:"1", a:2, _rev: 1 }, (item) =>
          assert.equal item.a, 2
    
          @db.scratch.find({ _id: "1" }).fetch (results) =>
            assert.equal 1, results.length, "Should be only one document"
            done()

    # Disabled since HybridDb doesn't remove underlying collections
    it 'removes rows when collection removed' #, (done) ->
      # @db.removeCollection 'scratch', =>
      #   @db.addCollection 'scratch', =>
      #     @db.scratch.find({}).fetch (results) =>
      #       assert.equal 0, results.length
      #       done()

    it 'call upsert with upserted row', (done) ->
      @db.scratch.upsert { _id:"1", a:1 }, (item) =>
        assert.deepEqual item, { _id:"1", a:1 }
        done()

  it 'upserts multiple rows', (done) ->
    @timeout(10000)
    @db.removeCollection 'scratch', =>
      @db.addCollection 'scratch', =>
        docs = []
        for i in [0...100]
          docs.push { x: i }

        @db.scratch.upsert docs, =>
          @db.scratch.find({}).fetch (results) =>
            assert.equal results.length, 100
            done()

  geopoint = (lng, lat) ->
    return {
      type: 'Point'
      coordinates: [lng, lat]
    }

  context 'With geolocated rows', ->
    beforeEach (done) ->
      @db.scratch.upsert { _id:"1", loc:geopoint(90, 45) }, =>
        @db.scratch.upsert { _id:"2", loc:geopoint(90, 46) }, =>
          @db.scratch.upsert { _id:"3", loc:geopoint(91, 45) }, =>
            @db.scratch.upsert { _id:"4", loc:geopoint(91, 46) }, =>
              done()

    it 'finds points near', (done) ->
      selector = loc: 
        $near: 
          $geometry: geopoint(90, 45)

      @db.scratch.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2","4"]
        done()

    it 'finds points near maxDistance', (done) ->
      selector = loc: 
        $near: 
          $geometry: geopoint(90, 45)
          $maxDistance: 111000

      @db.scratch.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()      

    it 'finds points near maxDistance just above', (done) ->
      selector = loc: 
        $near: 
          $geometry: geopoint(90, 45)
          $maxDistance: 112000

      @db.scratch.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
        done()

    it 'finds points within simple box', (done) ->
      selector = loc: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      @db.scratch.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["2"]
        done()

    it 'finds points within big box', (done) ->
      selector = loc: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [0, -89], [0, 89], [179, 89], [179, -89], [0, -89]
            ]]
      @db.scratch.find(selector, {sort:['_id']}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3", "4"]
        done()

    it 'handles undefined', (done) ->
      selector = loc: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      @db.scratch.upsert { _id:5 }, =>
        @db.scratch.find(selector).fetch (results) =>
          assert.deepEqual _.pluck(results, '_id'), ["2"]
          done()


