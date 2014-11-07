_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

error = (err) ->
  console.log err
  assert.fail(JSON.stringify(err))

# Runs queries on @col which must be a collection (with a:<string>, b:<integer>, c:<json>, geo:<geojson>)
# @reset(done) must truncate the collection
module.exports = ->
  context 'With sample rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", a:"Alice", b:1, c: { d: 1, e: 2 } }, =>
          @col.upsert { _id:"2", a:"Charlie", b:2 }, =>
            @col.upsert { _id:"3", a:"Bob", b:3 }, =>
              done()

    it 'finds all rows', (done) ->
      @col.find({}).fetch (results) =>
        assert.equal results.length, 3
        done()

    it 'finds all rows with options', (done) ->
      @col.find({}, {}).fetch (results) =>
        assert.equal 3, results.length
        done()

    it 'filters rows by id', (done) ->
      @col.find({ _id: "1" }).fetch (results) =>
        assert.equal 1, results.length
        assert.equal 'Alice', results[0].a
        done()

    it 'includes fields', (done) ->
      @col.find({ _id: "1" }, { fields: { a:1 }}).fetch (results) =>
        assert.deepEqual results[0], { _id: "1",  a: "Alice" }
        done()

    it 'includes fields', (done) ->
      @col.find({ _id: "1" }, { fields: { a:1 }}).fetch (results) =>
        assert.deepEqual results[0], { _id: "1",  a: "Alice" }
        done()

    it 'includes subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "c.d":1 }}).fetch (results) =>
        assert.deepEqual results[0], { _id: "1",  c: { d: 1 } }
        done()

    it 'ignores non-existent subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "x.y":1 }}).fetch (results) =>
        assert.deepEqual results[0], { _id: "1" }
        done()

    it 'excludes fields', (done) ->
      @col.find({ _id: "1" }, { fields: { a:0 }}).fetch (results) =>
        assert.isUndefined results[0].a
        assert.equal results[0].b, 1
        done()

    it 'excludes subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "c.d": 0 }}).fetch (results) =>
        assert.deepEqual results[0].c, { e: 2 }
        done()

    it 'finds one row', (done) ->
      @col.findOne { _id: "2" }, (result) =>
        assert.equal 'Charlie', result.a
        done()

    it 'removes item', (done) ->
      @col.remove "2", =>
        @col.find({}).fetch (results) =>
          assert.equal 2, results.length
          assert "1" in (result._id for result in results)
          assert "2" not in (result._id for result in results)
          done()

    it 'removes non-existent item', (done) ->
      @col.remove "999", =>
        @col.find({}).fetch (results) =>
          assert.equal 3, results.length
          done()

    it 'sorts ascending', (done) ->
      @col.find({}, {sort: ['a']}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
        done()

    it 'sorts descending', (done) ->
      @col.find({}, {sort: [['a','desc']]}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["2","3","1"]
        done()

    it 'limits', (done) ->
      @col.find({}, {sort: ['a'], limit:2}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()

    it 'fetches independent copies', (done) ->
      @col.findOne { _id: "2" }, (result1) =>
        @col.findOne { _id: "2" }, (result2) =>
          assert result1 != result2
          done()

    it 'adds _id to rows', (done) ->
      @col.upsert { a: "1" }, (item) =>
        assert.property item, '_id'
        assert.lengthOf item._id, 32
        done()

    it 'returns array if called with array', (done) ->
      @col.upsert [{ a: "1" }], (items) =>
        assert.equal items[0].a, "1"
        done()

    it 'updates by id', (done) ->
      @col.upsert { _id:"1", a:"1" }, (item) =>
        @col.upsert { _id:"1", a:"2", b: 1 }, (item) =>
          assert.equal item.a, "2"
    
          @col.find({ _id: "1" }).fetch (results) =>
            assert.equal 1, results.length, "Should be only one document"
            done()

    it 'call upsert with upserted row', (done) ->
      @col.upsert { _id:"1", a:"1" }, (item) =>
        assert.equal item._id, "1"
        assert.equal item.a, "1"
        done()

  it 'upserts multiple rows', (done) ->
    @timeout(10000)
    @reset =>
      docs = []
      for i in [0...100]
        docs.push { b: i }

      @col.upsert docs, =>
        @col.find({}).fetch (results) =>
          assert.equal results.length, 100
          done()
        , error
      , error

  geopoint = (lng, lat) ->
    return {
      type: 'Point'
      coordinates: [lng, lat]
    }

  context 'With geolocated rows', ->
    beforeEach (done) ->
      @col.upsert { _id:"1", geo:geopoint(90, 45) }, =>
        @col.upsert { _id:"2", geo:geopoint(90, 46) }, =>
          @col.upsert { _id:"3", geo:geopoint(91, 45) }, =>
            @col.upsert { _id:"4", geo:geopoint(91, 46) }, =>
              done()

    it 'finds points near', (done) ->
      selector = geo: 
        $near: 
          $geometry: geopoint(90, 45)

      @col.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2","4"]
        done()

    it 'finds points near maxDistance', (done) ->
      selector = geo: 
        $near: 
          $geometry: geopoint(90, 45)
          $maxDistance: 111000

      @col.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()      

    it 'finds points near maxDistance just above', (done) ->
      selector = geo: 
        $near: 
          $geometry: geopoint(90, 45)
          $maxDistance: 112000

      @col.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
        done()

    it 'finds points within simple box', (done) ->
      selector = geo: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      @col.find(selector).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["2"]
        done()

    it 'finds points within big box', (done) ->
      selector = geo: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [0, -89], [0, 89], [179, 89], [179, -89], [0, -89]
            ]]
      @col.find(selector, {sort:['_id']}).fetch (results) =>
        assert.deepEqual _.pluck(results, '_id'), ["1", "2", "3", "4"]
        done()

    it 'handles undefined', (done) ->
      selector = geo: 
        $geoIntersects: 
          $geometry: 
            type: 'Polygon'
            coordinates: [[
              [89.5, 45.5], [89.5, 46.5], [90.5, 46.5], [90.5, 45.5], [89.5, 45.5]
            ]]
      @col.upsert { _id:5 }, =>
        @col.find(selector).fetch (results) =>
          assert.deepEqual _.pluck(results, '_id'), ["2"]
          done()


