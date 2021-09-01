import chai from 'chai';
const {
  assert
} = chai;
import LocalStorageDb from "../src/LocalStorageDb";
import db_queries from "./db_queries";
import db_caching from "./db_caching";
import _ from 'lodash';

describe('LocalStorageDb', function() {
  before(function(done) {
    this.reset = done => {
      this.db = new LocalStorageDb();
      this.db.addCollection("scratch");
      this.col = this.db.scratch;
      return done();
    };
    return this.reset(done);
  });

  describe("passes queries", function() {
    return db_queries.call(this);
  });

  return describe("passes caching", function() {
    return db_caching.call(this);
  });
});

describe('LocalStorageDb with local storage', function() {
  before(function() {
    return this.db = new LocalStorageDb({ namespace: "db.scratch" });
  });

  beforeEach(function(done) {
    this.db.removeCollection('scratch');
    this.db.addCollection('scratch');
    return done();
  });

  it("retains items", function(done) {
    return this.db.scratch.upsert({ _id:"1", a:"Alice" }, function() {
      const db2 = new LocalStorageDb({ namespace: "db.scratch" });
      db2.addCollection('scratch');
      return db2.scratch.find({}).fetch(function(results) {
        assert.equal(results[0].a, "Alice");
        return done();
      });
    });
  });

  it("retains upserts", function(done) {
    return this.db.scratch.cacheOne({ _id:"1", a:"Alice" }, () => {
      return this.db.scratch.upsert({ _id:"1", a:"Bob" }, () => new LocalStorageDb({ namespace: "db.scratch" }, db2 => db2.addCollection('scratch', () => db2.scratch.find({}).fetch(function(results) {
        assert.deepEqual(results, [{ _id:"1", a:"Bob" }]);
        return db2.scratch.pendingUpserts(function(upserts) {
          assert.equal(upserts.length, 1);
          assert.deepEqual(upserts[0].doc, { _id:"1", a:"Bob" });
          assert.deepEqual(upserts[0].base, { _id:"1", a:"Alice" });
          return done();
        });
      }))));
    });
  });

  return it("retains removes", function(done) {
    return this.db.scratch.seed({ _id:"1", a:"Alice" }, () => {
      return this.db.scratch.remove("1", function() {
        const db2 = new LocalStorageDb({ namespace: "db.scratch" });
        db2.addCollection('scratch');
        return db2.scratch.pendingRemoves(function(removes) {
          assert.deepEqual(removes, ["1"]);
          return done();
        });
      });
    });
  });
});

describe('LocalStorageDb without local storage', function() {
  before(function() {
    return this.db = new LocalStorageDb();
  });

  beforeEach(function(done) {
    this.db.removeCollection('scratch');
    this.db.addCollection('scratch');
    return done();
  });

  it("does not retain items", function(done) {
    return this.db.scratch.upsert({ _id:"1", a:"Alice" }, function() {
      const db2 = new LocalStorageDb();
      db2.addCollection('scratch');
      return db2.scratch.find({}).fetch(function(results) {
        assert.equal(results.length, 0);
        return done();
      });
    });
  });

  it("does not retain upserts", function(done) {
    return this.db.scratch.upsert({ _id:"1", a:"Alice" }, function() {
      const db2 = new LocalStorageDb();
      db2.addCollection('scratch');
      return db2.scratch.find({}).fetch(results => db2.scratch.pendingUpserts(function(upserts) {
        assert.equal(results.length, 0);
        return done();
      }));
    });
  });

  return it("does not retain removes", function(done) {
    return this.db.scratch.seed({ _id:"1", a:"Alice" }, () => {
      return this.db.scratch.remove("1", function() {
        const db2 = new LocalStorageDb();
        db2.addCollection('scratch');
        return db2.scratch.pendingRemoves(function(removes) {
          assert.equal(removes.length, 0);
          return done();
        });
      });
    });
  });
});
