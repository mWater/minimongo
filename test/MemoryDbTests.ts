// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import chai from 'chai';
const {
  assert
} = chai;
import MemoryDb from "../src/MemoryDb";
import db_queries from "./db_queries";
import db_caching from "./db_caching";
import _ from 'lodash';

describe('MemoryDb', function() {
  before(function(done) {
    this.reset = done => {
      this.db = new MemoryDb();
      this.db.addCollection("scratch");
      this.col = this.db.scratch;
      return done();
    };
    return this.reset(done);
  });

  describe("passes queries", function() {
    return db_queries.call(this);
  });

  describe("passes caching", function() {
    return db_caching.call(this);
  });

  return describe("safety", function() {
    before(function() {
      return this.setupSafety = function(type) {
        this.db = new MemoryDb({ safety: type });
        this.db.addCollection("scratch");
        return this.col = this.db.scratch;
      };
    });

    describe("default (clone)", function() {
      beforeEach(function() {
        return this.setupSafety();
      });

      it("find returns different copy", function(done) {
        const row = { _id: "1", a: 'apple' };
        return this.col.cache([row], {}, {}, () => {
          return this.col.find({}).fetch(function(results) {
            assert(row !== results[0]);
            return done();
          });
        });
      });

      return it("upsert is a clone", function(done) {
        const row = { _id: "1", a: 'apple' };
        return this.col.upsert([row], () => {
          row.a = "banana";
          return this.col.find({}).fetch(function(results) {
            assert.equal(results[0].a, "apple");
            return done();
          });
        });
      });
    });

    return describe("freeze", function() {
      beforeEach(function() {
        return this.setupSafety("freeze");
      });

      it("upsert is a clone", function(done) {
        const row = { _id: "1", a: 'apple' };
        return this.col.upsert([row], () => {
          row.a = "banana";
          assert.equal(row.a, "banana");
          return this.col.find({}).fetch(function(results) {
            assert.equal(results[0].a, "apple");
            return done();
          });
        });
      });

      return it("find returns frozen", function(done) {
        const row = { _id: "1", a: 'apple' };
        return this.col.upsert([row], () => {
          return this.col.find({}).fetch(function(results) {
            assert(row !== results[0], "Different row");
            results[0].a = "banana";
            assert.equal(results[0].a, "apple");
            return done();
          });
        });
      });
    });
  });
});

