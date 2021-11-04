// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from "chai"
const { assert } = chai
import RemoteDb from "../src/RemoteDb"
import _ from "lodash"

describe("RemoteDb", function () {
  beforeEach(function (
    this: any,
  ) {
    this.httpCall = null
    this.callSuccessWith = null

    this.mockHttpClient = (method: any, url: any, params: any, data: any, success: any, error: any) => {
      this.httpCall = {
        method,
        url,
        params,
        data,
        success,
        error
      }
      if (this.callSuccessWith) {
        return success(this.callSuccessWith)
      }
    }

    this.db = new RemoteDb("http://someserver.com/", "clientid", this.mockHttpClient, true, true)
    this.db.addCollection("scratch")
    return (this.col = this.db.scratch)
  })

  it("calls GET for find", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      assert.deepEqual(data, [{ x: 1 }])
      done()
    }
    this.callSuccessWith = [{ x: 1 }]

    return this.col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())
  })

  it("calls POST for find that is too big", function (done: any) {
    let longStr = ""
    for (let i = 0; i < 1000; i++) {
      longStr += "x"
    }

    const success = (data: any) => {
      assert.equal(this.httpCall.method, "POST")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch/find")
      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, {
        selector: { a: longStr },
        limit: 10,
        sort: ["b"]
      })

      assert.deepEqual(data, [{ x: 1 }])
      done()
    }
    this.callSuccessWith = [{ x: 1 }]

    return this.col.find({ a: longStr }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())
  })

  it("calls GET for findOne", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 1, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      assert.deepEqual(data, { x: 1 })
      done()
    }
    this.callSuccessWith = [{ x: 1 }]

    return this.col.findOne({ a: 1 }, { sort: ["b"] }, success, () => assert.fail())
  })

  it("calls POST for new upsert", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "POST")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, { _id: "0", x: 1 })
      assert.deepEqual(data, { _id: "0", _rev: 1, x: 1 }, "success data wrong")
      done()
    }
    this.callSuccessWith = { _id: "0", _rev: 1, x: 1 }

    return this.col.upsert({ _id: "0", x: 1 }, success, () => assert.fail())
  })

  it("calls POST for new single bulk upsert", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "POST")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, { _id: "0", x: 1 })
      assert.deepEqual(data, [{ _id: "0", _rev: 1, x: 1 }])
      done()
    }
    this.callSuccessWith = { _id: "0", _rev: 1, x: 1 }

    return this.col.upsert([{ _id: "0", x: 1 }], success, () => assert.fail())
  })

  it("calls POST for new multiple bulk upsert", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "POST")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, [
        { _id: "0", x: 1 },
        { _id: "1", x: 2 }
      ])
      assert.deepEqual(data, [
        { _id: "0", _rev: 1, x: 1 },
        { _id: "1", _rev: 1, x: 2 }
      ])
      done()
    }
    this.callSuccessWith = [
      { _id: "0", _rev: 1, x: 1 },
      { _id: "1", _rev: 1, x: 2 }
    ]

    return this.col.upsert(
      [
        { _id: "0", x: 1 },
        { _id: "1", x: 2 }
      ],
      success,
      () => assert.fail()
    )
  })

  it("calls PATCH for upsert with base", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "PATCH")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, { doc: { _id: "0", _rev: 1, x: 2 }, base: { _id: "0", _rev: 1, x: 1 } })
      assert.deepEqual(data, { _id: "0", _rev: 1, x: 2 }, "success data wrong")
      done()
    }
    this.callSuccessWith = { _id: "0", _rev: 1, x: 2 }

    return this.col.upsert({ _id: "0", _rev: 1, x: 2 }, { _id: "0", _rev: 1, x: 1 }, success, () => assert.fail())
  })

  it("calls PATCH for new single bulk upsert with base", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "PATCH")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, { doc: { _id: "0", _rev: 1, x: 2 }, base: { _id: "0", _rev: 1, x: 1 } })
      assert.deepEqual(data, [{ _id: "0", _rev: 2, x: 2 }])
      done()
    }
    this.callSuccessWith = { _id: "0", _rev: 2, x: 2 }

    return this.col.upsert([{ _id: "0", _rev: 1, x: 2 }], [{ _id: "0", _rev: 1, x: 1 }], success, () => assert.fail())
  })

  it("calls PATCH for new multiple bulk upsert", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "PATCH")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")

      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, {
        doc: [
          { _id: "0", _rev: 1, x: 2 },
          { _id: "1", _rev: 1, x: 3 }
        ],
        base: [
          { _id: "0", _rev: 1, x: 1 },
          { _id: "1", _rev: 1, x: 2 }
        ]
      })
      assert.deepEqual(data, [
        { _id: "0", _rev: 2, x: 2 },
        { _id: "1", _rev: 2, x: 3 }
      ])
      done()
    }
    this.callSuccessWith = [
      { _id: "0", _rev: 2, x: 2 },
      { _id: "1", _rev: 2, x: 3 }
    ]

    return this.col.upsert(
      [
        { _id: "0", _rev: 1, x: 2 },
        { _id: "1", _rev: 1, x: 3 }
      ],
      [
        { _id: "0", _rev: 1, x: 1 },
        { _id: "1", _rev: 1, x: 2 }
      ],
      success,
      () => assert.fail()
    )
  })

  it("calls POST quickfind for find if localData passed", function (done: any) {
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "POST")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch/quickfind")
      assert.deepEqual(this.httpCall.params, { client: "clientid" }, JSON.stringify(this.httpCall.params))
      assert.deepEqual(this.httpCall.data, {
        quickfind: {
          "00": "6636b33e1be7df314fea"
        },
        selector: { a: 1 },
        limit: 10,
        sort: ["b"]
      })

      assert.deepEqual(
        data,
        [
          { _id: "0002", _rev: 1, a: 2, b: 1 },
          { _id: "0001", _rev: 2, a: 2, b: 2 }
        ],
        JSON.stringify(data)
      )
      done()
    }

    this.callSuccessWith = {
      "00": [
        { _id: "0001", _rev: 2, a: 2, b: 2 },
        { _id: "0002", _rev: 1, a: 2, b: 1 }
      ]
    }

    const localData = [{ _id: "0001", _rev: 1, a: 1 }]

    return this.col.find({ a: 1 }, { limit: 10, sort: ["b"], localData }).fetch(success, () => assert.fail())
  })

  it("supports array of URLs", function (done: any) {
    this.db = new RemoteDb(
      ["http://someserver.com/", "http://someotherserver.com/"],
      "clientid",
      this.mockHttpClient,
      true,
      true
    )
    this.db.addCollection("scratch")
    this.col = this.db.scratch
    const success = (data: any) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someotherserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      assert.deepEqual(data, [{ x: 1 }])
      done()
    }
    this.callSuccessWith = [{ x: 1 }]

    return this.col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())
  })

  return it("cycles through the provided array of URLs", function (done: any) {
    this.db = new RemoteDb(
      ["http://someserver.com/", "http://someotherserver.com/"],
      "clientid",
      this.mockHttpClient,
      true,
      true
    )
    this.db.addCollection("scratch")
    this.col = this.db.scratch

    let success = (data: any) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someotherserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      return assert.deepEqual(data, [{ x: 1 }])
    }
    this.callSuccessWith = [{ x: 1 }]

    this.col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())

    success = (data) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      return assert.deepEqual(data, [{ x: 1 }])
    }
    this.callSuccessWith = [{ x: 1 }]

    this.col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())

    success = (data) => {
      assert.equal(this.httpCall.method, "GET")
      assert.equal(this.httpCall.url, "http://someotherserver.com/scratch")
      assert.deepEqual(
        this.httpCall.params,
        { selector: '{"a":1}', limit: 10, sort: '["b"]', client: "clientid" },
        JSON.stringify(this.httpCall.params)
      )
      assert(!this.httpCall.data)

      assert.deepEqual(data, [{ x: 1 }])
      done()
    }
    this.callSuccessWith = [{ x: 1 }]

    return this.col.find({ a: 1 }, { limit: 10, sort: ["b"] }).fetch(success, () => assert.fail())
  })
})
