// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import * as quickfind from "../src/quickfind"
import _ from "lodash"
import sha1 from "js-sha1"

describe("quickfind", function () {
  before(function (this: any) {
    this.completeTest = function (clientRows: any, serverRows: any, sort: any) {
      const encodedRequest = quickfind.encodeRequest(clientRows)
      const encodedResponse = quickfind.encodeResponse(serverRows, encodedRequest)
      const decodedResponse = quickfind.decodeResponse(encodedResponse, clientRows, sort)

      return assert.deepEqual(
        decodedResponse,
        serverRows,
        JSON.stringify(decodedResponse, null, 2) + " vs " + JSON.stringify(serverRows, null, 2)
      )
    }

    this.row1 = { _id: "0000", _rev: 1, a: 2 }
    this.row2 = { _id: "0001", _rev: 2, a: 1 }
    this.row2a = { _id: "0001", _rev: 3, a: 3 }
    return (this.row3 = { _id: "0100", _rev: 1, a: 3 })
  })

  it("encodes as expected", function (this: any) {
    const request = quickfind.encodeRequest([this.row3, this.row2, this.row1])
    assert.equal(_.keys(request).length, 2)
    assert.equal(request["00"], sha1("0000:1|0001:2|").substr(0, 20))
    return assert.equal(request["01"], sha1("0100:1|").substr(0, 20))
  })

  it("only includes changes", function (this: any) {
    const request = quickfind.encodeRequest([this.row3, this.row2, this.row1])
    const response = quickfind.encodeResponse([this.row3, this.row1], request)

    assert.equal(_.keys(response).length, 1)
    return assert.deepEqual(response["00"], [this.row1])
  })

  it("starts with blank", function (this: any) {
    return this.completeTest([], [this.row1, this.row2, this.row3])
  })

  it("goes to blank", function (this: any) {
    return this.completeTest([this.row1, this.row2, this.row3], [])
  })

  it("replaces", function (this: any) {
    return this.completeTest([this.row1, this.row2, this.row3], [this.row1, this.row2a, this.row3])
  })

  return it("sorts", function (this: any) {
    return this.completeTest([this.row2, this.row1, this.row3], [this.row2, this.row1, this.row3], ["a"])
  })
})
