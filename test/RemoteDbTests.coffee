chai = require 'chai'
assert = chai.assert
RemoteDb = require "../lib/RemoteDb"
db_queries = require "./db_queries"
$ = require 'jquery'

# To work, this must have the following server running:
# NODE_ENV=test node server.js
describe.skip 'RemoteDb', ->
  @timeout(60000)
  beforeEach (done) ->
    url = 'http://localhost:8080/v3/'
    req = $.post(url + "_reset", {})
    req.fail (jqXHR, textStatus, errorThrown) =>
      throw textStatus
    req.done =>
      req = $.ajax(url + "users/test", {
        data : JSON.stringify({ email: "test@test.com", password:"xyzzy" }),
        contentType : 'application/json',
        type : 'PUT'})
      req.done (data) =>
        req = $.ajax(url + "clients", {
        data : JSON.stringify({ username:"test", password:"xyzzy" }),
        contentType : 'application/json',
        type : 'POST'})
        req.done (data) =>
          @client = data.client

          @db = new RemoteDb(url, @client)
          @db.addCollection('scratch')

          done()

  describe "passes queries", ->
    db_queries.call(this)

#fakeServer = require 'sinon/lib/sinon/util/fake_server'

# DISABLED because sinon is a mess. Code has been well tested in other app

# describe 'RemoteDb', ->
#   beforeEach (done) ->
#     @db = new RemoteDb("http://test/api/", "1234")
#     @db.addCollection("scratch")
#     @server = fakeServer.fakeServer.create()
#     @server.autoRespond = true

#   afterEach (done) ->
#     @server.restore()

#   it "encodes get", ->
#     @server.respondWith("GET", "http://test/api/scratch",
#                                 [200, { "Content-Type": "application/json" },
#                                  '[{ "_id": 12, "a": 1 }]']);    


#     @db.scratch.find({}).fetch (data) =>
#       console.log data
#     #@db.scratch.upsert {_id: "1234", a:1}, ->

      

#   #   url = 'http://localhost:8080/v3/'
#   #   req = $.post(url + "_reset", {})
#   #   req.fail (jqXHR, textStatus, errorThrown) =>
#   #     throw textStatus
#   #   req.done =>
#   #     req = $.ajax(url + "users/test", {
#   #       data : JSON.stringify({ email: "test@test.com", password:"xyzzy" }),
#   #       contentType : 'application/json',
#   #       type : 'PUT'})
#   #     req.done (data) =>
#   #       req = $.ajax(url + "users/test", {
#   #       data : JSON.stringify({ password:"xyzzy" }),
#   #       contentType : 'application/json',
#   #       type : 'POST'})
#   #       req.done (data) =>
#   #         @client = data.client

#   #         @db = new RemoteDb(url, @client)
#   #         @db.addCollection('scratch')

#   #         done()

#   # describe "passes queries", ->
#   #   db_queries.call(this)
