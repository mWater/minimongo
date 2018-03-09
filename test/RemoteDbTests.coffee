chai = require 'chai'
assert = chai.assert
RemoteDb = require "../src/RemoteDb"
_ = require 'lodash'

describe 'RemoteDb', ->
  beforeEach () ->
    @httpCall = null
    @callSuccessWith = null

    @mockHttpClient = (method, url, params, data, success, error) =>
      @httpCall = {
        method: method
        url: url
        params: params
        data: data
        success: success
        error: error
      }
      if @callSuccessWith
        success(@callSuccessWith)

    @db = new RemoteDb("http://someserver.com/", "clientid", @mockHttpClient, true)
    @db.addCollection("scratch")
    @col = @db.scratch

  it "calls GET for find", (done) ->
    success = (data) =>
      assert.equal @httpCall.method, "GET"
      assert.equal @httpCall.url, "http://someserver.com/scratch"
      assert.deepEqual @httpCall.params, { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" }, JSON.stringify(@httpCall.params)
      assert not @httpCall.data

      assert.deepEqual data, [{ x: 1 }]
      done()
    @callSuccessWith = [{ x: 1 }]

    @col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () -> assert.fail())

  it "calls GET for findOne", (done) ->
    success = (data) =>
      assert.equal @httpCall.method, "GET"
      assert.equal @httpCall.url, "http://someserver.com/scratch"
      assert.deepEqual @httpCall.params, { selector: '{"a":1}', limit: 1, sort: '["b"]', client: "clientid" }, JSON.stringify(@httpCall.params)
      assert not @httpCall.data

      assert.deepEqual data, { x: 1 }
      done()
    @callSuccessWith = [{ x: 1 }]

    @col.findOne({ a: 1 }, { sort: ["b"] }, success, () -> assert.fail())

  it "calls POST for new upsert", (done) ->
    success = (data) =>
      assert.equal @httpCall.method, "POST"
      assert.equal @httpCall.url, "http://someserver.com/scratch"

      assert.deepEqual @httpCall.params, { client: "clientid" }, JSON.stringify(@httpCall.params)
      assert.deepEqual @httpCall.data, { _id: "0", x: 1 }
      assert.deepEqual data, { _id: "0", _rev: 1, x: 1 }
      done()
    @callSuccessWith = { _id: "0", _rev: 1, x: 1 }

    @col.upsert({ _id: "0", x: 1 }, success, () -> assert.fail())

  it "calls POST quickfind for find if localData passed", (done) ->
    success = (data) =>
      assert.equal @httpCall.method, "POST"
      assert.equal @httpCall.url, "http://someserver.com/scratch/quickfind"
      assert.deepEqual @httpCall.params, { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" }, JSON.stringify(@httpCall.params)
      assert.deepEqual @httpCall.data, {
        "00": "6636b33e1be7df314fea"
      }

      assert.deepEqual data, [
        { _id: "0002", _rev: 1, a: 2, b: 1 }
        { _id: "0001", _rev: 2, a: 2, b: 2 }
      ], JSON.stringify(data)
      done()

    @callSuccessWith = { "00": [
      { _id: "0001", _rev: 2, a: 2, b: 2 }
      { _id: "0002", _rev: 1, a: 2, b: 1 }
    ]}

    localData = [
      { _id: "0001", _rev: 1, a: 1 }
    ]

    @col.find({ a: 1 }, { limit: 10, sort: ["b"], localData: localData }).fetch(success, () -> assert.fail())

