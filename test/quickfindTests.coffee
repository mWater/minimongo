chai = require 'chai'
assert = chai.assert
quickfind = require "../src/quickfind"
_ = require 'lodash'
sha1 = require ('js-sha1')

describe 'quickfind', ->
  before ->
    @completeTest = (clientRows, serverRows, sort) ->
      encodedRequest = quickfind.encodeRequest(clientRows)
      encodedResponse = quickfind.encodeResponse(serverRows, encodedRequest)
      decodedResponse = quickfind.decodeResponse(encodedResponse, clientRows, sort)

      assert.deepEqual decodedResponse, serverRows, JSON.stringify(decodedResponse, null, 2) + " vs " + JSON.stringify(serverRows, null, 2)

    @row1 = { _id: "0000", _rev: 1, a: 2 }
    @row2 = { _id: "0001", _rev: 2, a: 1 }
    @row2a = { _id: "0001", _rev: 3, a: 3 }
    @row3 = { _id: "0100", _rev: 1, a: 3 }

  it "encodes as expected", ->
    request = quickfind.encodeRequest([@row3, @row2, @row1])
    assert.equal _.keys(request).length, 2
    assert.equal request["00"], sha1("0000:1|0001:2|").substr(0, 20)
    assert.equal request["01"], sha1("0100:1|").substr(0, 20)

  it "only includes changes", ->
    request = quickfind.encodeRequest([@row3, @row2, @row1])
    response = quickfind.encodeResponse([@row3, @row1], request)

    assert.equal _.keys(response).length, 1
    assert.deepEqual response["00"], [@row1]

  it "starts with blank", ->
    @completeTest([], [@row1, @row2, @row3])

  it "goes to blank", ->
    @completeTest([@row1, @row2, @row3], [])

  it "replaces", ->
    @completeTest([@row1, @row2, @row3], [@row1, @row2a, @row3])

  it "sorts", ->
    @completeTest([@row2, @row1, @row3], [@row2, @row1, @row3], ["a"])
