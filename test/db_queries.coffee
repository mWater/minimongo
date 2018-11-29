_ = require 'lodash'
chai = require 'chai'
assert = chai.assert

error = (err) ->
  console.log err
  assert.fail(JSON.stringify(err))

# Runs queries on @col which must be a collection (with a:<string>, b:<integer>, c:<json>, geo:<geojson>, stringarr: <json array of strings>)
# When present:
# c.arrstr is an array of string values
# c.arrint is an array of integer values
# @reset(done) must truncate the collection
module.exports = ->
  before ->
    # Test a filter to return specified rows (in order)
    @testFilter = (filter, ids, done) ->
      @col.find(filter, { sort:["_id"]}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ids
        done()

  context 'With sample rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", a:"Alice", b:1, c: { d: 1, e: 2 } }, =>
          @col.upsert { _id:"2", a:"Charlie", b:2, c: { d: 2, e: 3 } }, =>
            @col.upsert { _id:"3", a:"Bob", b:3 }, ->
              done()

    it 'finds all rows', (done) ->
      @col.find({}).fetch (results) ->
        assert.equal results.length, 3
        done()

    it 'finds all rows with options', (done) ->
      @col.find({}, {}).fetch (results) ->
        assert.equal 3, results.length
        done()

    it 'filters by id', (done) ->
      @testFilter { _id: "1" }, ["1"], done

    it 'filters by string', (done) ->
      @testFilter { a: "Alice" }, ["1"], done

    it 'filters by $in string', (done) ->
      @testFilter { a: { $in: ["Alice", "Charlie"]} }, ["1", "2"], done

    it 'filters by number', (done) ->
      @testFilter { b: 2 }, ["2"], done

    it 'filters by $in number', (done) ->
      @testFilter { b: { $in: [2, 3]} }, ["2", "3"], done

    it 'filters by $regex', (done) ->
      @testFilter { a: { $regex: "li"} }, ["1", "2"], done

    it 'filters by $regex case-sensitive', (done) ->
      @testFilter { a: { $regex: "A"} }, ["1"], done

    it 'filters by $regex case-insensitive', (done) ->
      @testFilter { a: { $regex: "A", $options: 'i' } }, ["1", "2"], done

    it 'filters by $or', (done) ->
      @testFilter { "$or": [{b:1}, {b:2}]}, ["1","2"], done

    it 'filters by path', (done) ->
      @testFilter { "c.d": 2 }, ["2"], done

    it 'filters by $ne', (done) ->
      @testFilter { "b": { $ne: 2 }}, ["1","3"], done

    it 'filters by $gt', (done) ->
      @testFilter { "b": { $gt: 1 }}, ["2","3"], done

    it 'filters by $lt', (done) ->
      @testFilter { "b": { $lt: 3 }}, ["1","2"], done

    it 'filters by $gte', (done) ->
      @testFilter { "b": { $gte: 2 }}, ["2","3"], done

    it 'filters by $lte', (done) ->
      @testFilter { "b": { $lte: 2 }}, ["1","2"], done

    it 'filters by $not', (done) ->
      @testFilter { "b": { $not: { $lt: 3 }}}, ["3"], done

    it 'filters by $or', (done) ->
      @testFilter { $or: [{b: 3},{b: 1}]}, ["1", "3"], done

    it 'filters by $exists: true', (done) ->
      @testFilter { c: { $exists: true }}, ["1", "2"], done

    it 'filters by $exists: false', (done) ->
      @testFilter { c: { $exists: false }}, ["3"], done

    it 'includes fields', (done) ->
      @col.find({ _id: "1" }, { fields: { a:1 }}).fetch (results) ->
        assert.deepEqual results[0], { _id: "1",  a: "Alice" }
        done()

    it 'includes subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "c.d":1 }}).fetch (results) ->
        assert.deepEqual results[0], { _id: "1",  c: { d: 1 } }
        done()

    it 'ignores non-existent subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "x.y":1 }}).fetch (results) ->
        assert.deepEqual results[0], { _id: "1" }
        done()

    it 'excludes fields', (done) ->
      @col.find({ _id: "1" }, { fields: { a:0 }}).fetch (results) ->
        assert.isUndefined results[0].a
        assert.equal results[0].b, 1
        done()

    it 'excludes subfields', (done) ->
      @col.find({ _id: "1" }, { fields: { "c.d": 0 }}).fetch (results) ->
        assert.deepEqual results[0].c, { e: 2 }
        done()

    it 'finds one row', (done) ->
      @col.findOne { _id: "2" }, (result) ->
        assert.equal 'Charlie', result.a
        done()

    it 'removes item', (done) ->
      @col.remove "2", =>
        @col.find({}).fetch (results) ->
          assert.equal 2, results.length
          assert "1" in (result._id for result in results)
          assert "2" not in (result._id for result in results)
          done()
        , error
      , error

    it 'removes non-existent item', (done) ->
      @col.remove "999", =>
        @col.find({}).fetch (results) ->
          assert.equal 3, results.length
          done()

    it 'sorts ascending', (done) ->
      @col.find({}, {sort: ['a']}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2"]
        done()

    it 'sorts descending', (done) ->
      @col.find({}, {sort: [['a','desc']]}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["2","3","1"]
        done()

    it 'limits', (done) ->
      @col.find({}, {sort: ['a'], limit:2}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()

    it 'skips', (done) ->
      @col.find({}, {sort: ['a'], skip:2}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["2"]
        done()

    # MemoryDb is much faster if we relax this constraint
    it 'fetches independent copies', (done) ->
      @col.findOne { _id: "2" }, (result1) =>
        @col.findOne { _id: "2" }, (result2) ->
          assert result1 != result2
          done()

    # MemoryDb is much faster if we relax this constraint
    it 'upsert keeps independent copies', (done) ->
      doc = { _id: "2" }
      @col.upsert doc, (item) =>
        doc.a = "xyz"
        item.a = "xyz"
        @col.findOne { _id:"2" }, (doc2) ->
          assert doc != doc2
          assert doc2.a != "xyz"
          done()

    it 'adds _id to rows', (done) ->
      @col.upsert { a: "1" }, (item) ->
        assert.property item, '_id'
        assert.lengthOf item._id, 32
        done()

    it 'returns array if called with array', (done) ->
      @col.upsert [{ a: "1" }], (items) ->
        assert.equal items[0].a, "1"
        done()

    it 'updates by id', (done) ->
      @col.upsert { _id:"1", a:"1" }, (item) =>
        @col.upsert { _id:"1", a:"2", b: 1 }, (item) =>
          assert.equal item.a, "2"

          @col.find({ _id: "1" }).fetch (results) ->
            assert.equal 1, results.length, "Should be only one document"
            done()

    it 'call upsert with upserted row', (done) ->
      @col.upsert { _id:"1", a:"1" }, (item) ->
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
        @col.find({}).fetch (results) ->
          assert.equal results.length, 100
          done()
        , error
      , error

  context 'With sample with capitalization', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", a:"Alice", b:1, c: { d: 1, e: 2 } }, =>
          @col.upsert { _id:"2", a:"AZ", b:2, c: { d: 2, e: 3 } }, ->
            done()

    it 'finds sorts in Javascript order', (done) ->
      @col.find({}, {sort: ['a']}).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["2","1"]
        done()

  context 'With integer array in json rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: { arrint: [1, 2] }}, =>
          @col.upsert { _id:"2", c: { arrint: [2, 3] }}, =>
            @col.upsert { _id:"3", c: { arrint: [1, 3] }}, ->
              done()

    it 'filters by $in', (done) ->
      @testFilter { "c.arrint": { $in: [3] }}, ["2", "3"], done

    it 'filters by list $in with multiple', (done) ->
      @testFilter { "c.arrint": { $in: [1, 3] }}, ["1", "2", "3"], done

  context 'With object array rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: [{ x: 1, y: 1 }, { x:1, y:2 }] }, =>
          @col.upsert { _id:"2", c: [{ x: 2, y: 1 }] }, =>
            @col.upsert { _id:"3", c: [{ x: 2, y: 2 }] }, ->
              done()

    it 'filters by $elemMatch', (done) ->
      @testFilter { "c": { $elemMatch: { y:1 }}}, ["1", "2"], =>
        @testFilter { "c": { $elemMatch: { x:1 }}}, ["1"], done

  context 'With array rows with inner string arrays', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", c: [{ arrstr: ["a", "b"]}, { arrstr: ["b", "c"]}] }, =>
          @col.upsert { _id:"2", c: [{ arrstr: ["b"]}] }, =>
            @col.upsert { _id:"3", c: [{ arrstr: ["c", "d"]}, { arrstr: ["e", "f"]}] }, ->
              done()

    it 'filters by $elemMatch', (done) ->
      @testFilter { "c": { $elemMatch: { "arrstr": { $in: ["b"]} }}}, ["1", "2"], =>
        @testFilter { "c": { $elemMatch: { "arrstr": { $in: ["d", "e"]} }}}, ["3"], done

  context 'With text array rows', ->
    beforeEach (done) ->
      @reset =>
        @col.upsert { _id:"1", textarr: ["a", "b"]}, =>
          @col.upsert { _id:"2", textarr: ["b", "c"]}, =>
            @col.upsert { _id:"3", textarr: ["c", "d"]}, ->
              done()
            , error
          , error
        , error

    it 'filters by $in', (done) ->
      @testFilter { "textarr": { $in: ["b"] }}, ["1", "2"], done

    it 'filters by direct reference', (done) ->
      @testFilter { "textarr": "b" }, ["1", "2"], done

    it 'filters by both item and complete array', (done) ->
      @testFilter { "textarr": { $in: ["a", ["b", "c"]] } }, ["1", "2"], done

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
            @col.upsert { _id:"4", geo:geopoint(91, 46) }, ->
              done()

    it 'finds points near', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)

      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1","3","2","4"]
        done()

    it 'finds points near maxDistance', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)
          $maxDistance: 111180

      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1","3"]
        done()

    it 'finds points near maxDistance just above', (done) ->
      selector = geo:
        $near:
          $geometry: geopoint(90, 45)
          $maxDistance: 111410

      @col.find(selector).fetch (results) ->
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
      @col.find(selector).fetch (results) ->
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
      @col.find(selector, {sort:['_id']}).fetch (results) ->
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
        @col.find(selector).fetch (results) ->
          assert.deepEqual _.pluck(results, '_id'), ["2"]
          done()

  context 'With polygon rows', ->
    polygon = (coords) => {
      type: 'Polygon'
      coordinates: coords
    }

    beforeEach (done) ->
      @col.upsert { _id:"1", geo: polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]) }, =>
        @col.upsert { _id:"2", geo: polygon([[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]) }, =>
          done()

    it 'finds polygons that intersect simple box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1"]
        done()

    it 'finds polygons that intersect large box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[0, 0], [12, 0], [12, 12], [0, 12], [0, 0]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1", "2"]
        done()

  context 'With multipolygon rows', ->
    polygon = (coords) => {
      type: 'Polygon'
      coordinates: coords
    }

    multipolygon = (coords) => {
      type: 'MultiPolygon'
      coordinates: coords
    }

    beforeEach (done) ->
      @col.upsert { _id:"1", geo: multipolygon([[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]]) }, =>
        @col.upsert { _id:"2", geo: multipolygon([[[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]]) }, =>
          done()

    it 'finds polygons that intersect simple box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1"]
        done()

    it 'finds polygons that intersect large box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[0, 0], [12, 0], [12, 12], [0, 12], [0, 0]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1", "2"]
        done()

  context 'With multilinestring rows', ->
    polygon = (coords) => {
      type: 'Polygon'
      coordinates: coords
    }

    beforeEach (done) ->
      linestring = {
        type: "MultiLineString"
        coordinates: [
          [[0, 0], [0, 1]]
          [[0, 0], [1, 0]]
        ]
      }
      @col.upsert { _id:"1", geo: linestring }, =>
        done()

    it 'finds that that intersect simple box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), ["1"]
        done()

    it 'finds that that doesn\'t intersect simple box', (done) ->
      selector = geo:
        $geoIntersects:
          $geometry: polygon([[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]])
      @col.find(selector).fetch (results) ->
        assert.deepEqual _.pluck(results, '_id'), []
        done()
