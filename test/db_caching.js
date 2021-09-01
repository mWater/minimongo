// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import _ from 'lodash';
import chai from 'chai';
const {
  assert
} = chai;

// Runs caching tests on @col which must be a collection (with a:<string>, b:<integer>, c:<json>, geo:<geojson>)
// @reset(done) must truncate the collection
export default () => describe("local database", function() {
  beforeEach(function(done) {
    return this.reset(done);
  });

  it('caches row', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results[0].a, 'apple');
        return done();
      });
    });
  });

  it('caches rows', function(done) {
    const rows = [
      { _id: "1", a: 'apple' },
      { _id: "2", a: 'banana' },
      { _id: "3", a: 'orange' },
      { _id: "4", a: 'kiwi' }
    ];
    return this.col.cache(rows, {}, {}, () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results.length, 4);
        return done();
      });
    });
  });

  it('caches zero rows', function(done) {
    const rows = [];
    return this.col.cache(rows, {}, {}, () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results.length, 0);
        return done();
      });
    });
  });

  it('cache overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'banana' }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'banana');
          return done();
        });
      });
    });
  });

  it('cache with same _rev does not overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple', _rev: 2 }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'banana', _rev: 2 }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it('cache with greater _rev overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple', _rev: 1 }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'banana', _rev: 2 }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'banana');
          return done();
        });
      });
    });
  });

  it('cache with lesser _rev does not overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple', _rev: 2 }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'banana', _rev: 1 }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("cache doesn't overwrite upsert", function(done) {
    return this.col.upsert({ _id: "1", a: 'apple' }, () => {
      return this.col.cache([{ _id: "1", a: 'banana' }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("cache doesn't overwrite remove", function(done) {
    return this.col.cache([{ _id: "1", a: 'delete' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.cache([{ _id: "1", a: 'banana' }], {}, {}, () => {
          return this.col.find({}).fetch(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it("cache removes missing unsorted", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'a' }, { _id: "3", a: 'c' }], {}, {}, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results.length, 2);
          return done();
        });
      });
    });
  });

  it("cache excludes excluded", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'a' }, { _id: "4", a: 'd' }, { _id: "5", a: "e" }], {}, { exclude: ["2", "4"] }, () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "2", "5"]);
          return done();
        });
      });
    });
  });

  it("handles implicitly sorted ($near) with limit");
  // TODO

  it("cache removes missing filtered", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'a' }], {_id: {$lt:"3"}}, {}, () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
          return done();
        });
      });
    });
  });

  it("cache removes missing sorted limited", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.cache([{ _id: "1", a: 'a' }], {}, {sort:['_id'], limit:2}, () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
          return done();
        });
      });
    });
  });

  it("cache does not remove missing sorted limited past end", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, {}, () => {
      return this.col.remove("2", () => {
        return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }], {}, {sort:['_id'], limit:2}, () => {
          return this.col.find({}, {sort:['_id']}).fetch(function(results) {
            assert.deepEqual(_.pluck(results, '_id'), ["1", "3", "4"]);
            return done();
          });
        });
      });
    });
  });

  it("cache does not remove missing unsorted limited", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, {}, () => {
      return this.col.cache([{ _id: "3", a: 'c' }, { _id: "4", a: 'd' }], {}, { limit: 2 }, () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "2", "3", "4"]);
          return done();
        });
      });
    });
  });

  it("uncache removes matching", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.uncache({ a: 'b' }, () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
          return done();
        });
      });
    });
  });

  it("uncache does not remove upserts", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.upsert({ _id: "2", a: 'b' }, () => {
        return this.col.uncache({ a: 'b' }, () => {
          return this.col.find({}, {sort:['_id']}).fetch(function(results) {
            assert.deepEqual(_.pluck(results, '_id'), ["1", "2", "3"]);
            return done();
          });
        });
      });
    });
  });

  it("uncache does not remove removes", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.remove("2", () => {
        return this.col.uncache({ a: 'b' }, () => {
          return this.col.find({}, {sort:['_id']}).fetch(results => {
            assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
            return this.col.pendingRemoves(results => {
              assert.deepEqual(results, ["2"]);
              return done();
            });
          });
        });
      });
    });
  });

  it("cacheList caches", function(done) {
    return this.col.cacheList([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], () => {
      return this.col.find({}, {sort:['_id']}).fetch(function(results) {
        assert.deepEqual(_.pluck(results, '_id'), ["1", "2", "3"]);
        return done();
      });
    });
  });

  it("cacheList does not overwrite upserted", function(done) {
    return this.col.upsert({ _id: "1", a: 'apple' }, () => {
      return this.col.cacheList([{ _id: "1", a: 'banana' }], () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("cacheList doesn't overwrite remove", function(done) {
    return this.col.cacheList([{ _id: "1", a: 'delete' }], () => {
      return this.col.remove("1", () => {
        return this.col.cacheList([{ _id: "1", a: 'banana' }], () => {
          return this.col.find({}).fetch(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it("uncacheList removes ids", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.uncacheList(["2"], () => {
        return this.col.find({}, {sort:['_id']}).fetch(function(results) {
          assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
          return done();
        });
      });
    });
  });

  it("uncacheList does not remove upserts", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.upsert({ _id: "2", a: 'b' }, () => {
        return this.col.uncacheList(["2"], () => {
          return this.col.find({}, {sort:['_id']}).fetch(function(results) {
            assert.deepEqual(_.pluck(results, '_id'), ["1", "2", "3"]);
            return done();
          });
        });
      });
    });
  });

  it("uncacheList does not remove removes", function(done) {
    return this.col.cache([{ _id: "1", a: 'a' }, { _id: "2", a: 'b' }, { _id: "3", a: 'c' }], {}, {}, () => {
      return this.col.remove("2", () => {
        return this.col.uncacheList(["2"], () => {
          return this.col.find({}, {sort:['_id']}).fetch(results => {
            assert.deepEqual(_.pluck(results, '_id'), ["1", "3"]);
            return this.col.pendingRemoves(results => {
              assert.deepEqual(results, ["2"]);
              return done();
            });
          });
        });
      });
    });
  });


  it("returns pending upserts", function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.upsert({ _id: "2", a: 'banana' }, () => {
        return this.col.pendingUpserts(function(results) {
          assert.equal(results.length, 1);
          assert.equal(results[0].doc.a, 'banana');
          assert.isNull(results[0].base);
          return done();
        });
      });
    });
  });

  it("resolves pending upserts", function(done) {
    return this.col.upsert({ _id: "2", a: 'banana' }, () => {
      return this.col.resolveUpserts([{ doc: { _id: "2", a: 'banana' }, base: null }], () => {
        return this.col.pendingUpserts(function(results) {
          assert.equal(results.length, 0);
          return done();
        });
      });
    });
  });

  it("sets base of upserts", function(done) {
    return this.col.cacheOne({ _id: "2", a: 'apple' }, () => {
      return this.col.upsert({ _id: "2", a: 'banana' }, () => {
        return this.col.pendingUpserts(function(results) {
          assert.equal(results.length, 1);
          assert.equal(results[0].doc.a, 'banana');
          assert.equal(results[0].base.a, 'apple');
          return done();
        });
      });
    });
  });

  it("keeps base on subsequent upserts", function(done) {
    return this.col.cacheOne({ _id: "2", a: 'apple' }, () => {
      return this.col.upsert({ _id: "2", a: 'banana' }, () => {
        return this.col.upsert({ _id: "2", a: 'orange' }, () => {
          return this.col.pendingUpserts(function(results) {
            assert.equal(results.length, 1);
            assert.equal(results[0].doc.a, 'orange');
            assert.equal(results[0].base.a, 'apple');
            return done();
          });
        });
      });
    });
  });

  it("allows setting of upsert base", function(done) {
    return this.col.upsert({ _id: "2", a: 'banana' }, { _id: "2", a: 'apple' }, () => {
      return this.col.pendingUpserts(function(results) {
        assert.equal(results.length, 1);
        assert.equal(results[0].doc.a, 'banana');
        assert.equal(results[0].base.a, 'apple');
        return done();
      });
    });
  });

  it("allows setting of null upsert base", function(done) {
    return this.col.cacheOne({ _id: "2", a: 'apple' }, () => {
      return this.col.upsert({ _id: "2", a: 'banana' }, null, () => {
        return this.col.pendingUpserts(function(results) {
          assert.equal(results.length, 1);
          assert.equal(results[0].doc.a, 'banana');
          assert.equal(results[0].base, null);
          return done();
        });
      });
    });
  });

  it("allows multiple upserts", function(done) {
    const docs = [
      { _id: "1", a: 'apple' },
      { _id: "2", a: 'banana' },
      { _id: "3", a: 'orange' }
    ];
    return this.col.upsert(docs, () => {
      return this.col.pendingUpserts(function(results) {
        assert.deepEqual(_.pluck(results, "doc"), docs);
        assert.deepEqual(_.pluck(results, "base"), [null, null, null]);
        return done();
      });
    });
  });

  it("allows multiple upserts with bases", function(done) {
    const docs = [
      { _id: "1", a: 'apple' },
      { _id: "2", a: 'banana' },
      { _id: "3", a: 'orange' }
    ];
    const bases = [
      { _id: "1", a: 'apple2' },
      { _id: "2", a: 'banana2' },
      { _id: "3", a: 'orange2' }
    ];
    return this.col.upsert(docs, bases, () => {
      return this.col.pendingUpserts(function(results) {
        assert.deepEqual(_.pluck(results, "doc"), docs);
        assert.deepEqual(_.pluck(results, "base"), bases);
        return done();
      });
    });
  });


  it("resolves multiple upserts", function(done) {
    const docs = [
      { _id: "1", a: 'apple' },
      { _id: "2", a: 'banana' },
      { _id: "3", a: 'orange' }
    ];
    return this.col.upsert(docs, () => {
      return this.col.pendingUpserts(upserts => {
        return this.col.resolveUpserts(upserts, () => {
          return this.col.pendingUpserts(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it("handles removed pending upserts", function(done) {
    const docs = [
      { _id: "1", a: 'apple' },
      { _id: "2", a: 'banana' },
      { _id: "3", a: 'orange' }
    ];
    return this.col.upsert(docs, () => {
      return this.col.remove(1, () => {
        return this.col.resolveRemove(1, () => {
          return this.col.pendingUpserts(upserts => {
            return this.col.resolveUpserts(upserts, () => {
              return this.col.pendingUpserts(function(results) {
                assert.equal(results.length, 0);
                return done();
              });
            });
          });
        });
      });
    });
  });

  it("retains changed pending upserts but updates base", function(done) {
    return this.col.upsert({ _id: "2", a: 'banana' }, () => {
      return this.col.upsert({ _id: "2", a: 'banana2' }, () => {
        return this.col.resolveUpserts([{ doc: { _id: "2", a: 'banana' }, base: null }], () => {
          return this.col.pendingUpserts(function(results) {
            assert.equal(results.length, 1);
            assert.equal(results[0].doc.a, 'banana2');
            assert.equal(results[0].base.a, 'banana');
            return done();
          });
        });
      });
    });
  });

  it("removes by filter", function(done) {
    return this.col.upsert({ _id: "1", a: 'apple' }, () => {
      return this.col.upsert({ _id: "2", a: 'banana' }, () => {
        return this.col.upsert({ _id: "3", a: 'banana' }, () => {
          return this.col.remove({ a: "banana" }, () => {
            return this.col.pendingUpserts(function(results) {
              assert.equal(results.length, 1);
              assert.equal(results[0].doc.a, "apple");
              return done();
            });
          });
        });
      });
    });
  });

  it("removes pending upserts", function(done) {
    return this.col.upsert({ _id: "2", a: 'banana' }, () => {
      return this.col.remove("2", () => {
        return this.col.pendingUpserts(function(results) {
          assert.equal(results.length, 0);
          return done();
        });
      });
    });
  });

  it("returns pending removes", function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.pendingRemoves(function(results) {
          assert.equal(results.length, 1);
          assert.equal(results[0], 1);
          return done();
        });
      });
    });
  });

  it("returns pending removes that are not present", function(done) {
    return this.col.remove("2", () => {
      return this.col.pendingRemoves(function(results) {
        assert.equal(results.length, 1);
        assert.equal(results[0], 2);
        return done();
      });
    });
  });

  it("resolves pending removes", function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.resolveRemove("1", () => {
          return this.col.pendingRemoves(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it("seeds", function(done) {
    return this.col.seed([{ _id: "1", a: 'apple' }], () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results[0].a, 'apple');
        return done();
      });
    });
  });

  it("does not overwrite existing", function(done) {
    return this.col.cache([{ _id: "1", a: 'banana' }], {}, {}, () => {
      return this.col.seed([{ _id: "1", a: 'apple' }], () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'banana');
          return done();
        });
      });
    });
  });

  it("does not add removed", function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.seed([{ _id: "1", a: 'apple' }], () => {
          return this.col.find({}).fetch(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it("allows removing uncached rows", function(done) {
    return this.col.remove("12345", () => {
      return this.col.pendingRemoves(function(results) {
        assert.equal(results.length, 1);
        assert.equal(results[0], "12345");
        return done();
      });
    });
  });

  it('seeds rows', function(done) {
    return this.col.seed([{ _id: "1", a: 'apple' }], () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results[0].a, 'apple');
        return done();
      });
    });
  });

  it('seed does not overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.seed({ _id: "1", a: 'banana' }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("seed doesn't overwrite upsert", function(done) {
    return this.col.upsert({ _id: "1", a: 'apple' }, () => {
      return this.col.seed({ _id: "1", a: 'banana' }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("seed doesn't overwrite remove", function(done) {
    return this.col.cache([{ _id: "1", a: 'delete' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.seed({ _id: "1", a: 'banana' }, () => {
          return this.col.find({}).fetch(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it('cache one single doc', function(done) {
    return this.col.cacheOne({ _id: "1", a: 'apple' }, () => {
      return this.col.find({}).fetch(function(results) {
        assert.equal(results[0].a, 'apple');
        return done();
      });
    });
  });

  it('cache one overwrite existing', function(done) {
    return this.col.cache([{ _id: "1", a: 'apple' }], {}, {}, () => {
      return this.col.cacheOne({ _id: "1", a: 'banana' }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'banana');
          return done();
        });
      });
    });
  });

  it("cache one doesn't overwrite upsert", function(done) {
    return this.col.upsert({ _id: "1", a: 'apple' }, () => {
      return this.col.cacheOne({ _id: "1", a: 'banana' }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it("cache one doesn't overwrite remove", function(done) {
    return this.col.cache([{ _id: "1", a: 'delete' }], {}, {}, () => {
      return this.col.remove("1", () => {
        return this.col.cacheOne({ _id: "1", a: 'banana' }, () => {
          return this.col.find({}).fetch(function(results) {
            assert.equal(results.length, 0);
            return done();
          });
        });
      });
    });
  });

  it('cache one with same _rev does not overwrite existing', function(done) {
    return this.col.cacheOne({ _id: "1", a: 'apple', _rev: 2 }, () => {
      return this.col.cacheOne({ _id: "1", a: 'banana', _rev: 2 }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });

  it('cache one with greater _rev overwrite existing', function(done) {
    return this.col.cacheOne({ _id: "1", a: 'apple', _rev: 1 }, () => {
      return this.col.cacheOne({ _id: "1", a: 'banana', _rev: 2 }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'banana');
          return done();
        });
      });
    });
  });

  return it('cache one with lesser _rev does not overwrite existing', function(done) {
    return this.col.cacheOne({ _id: "1", a: 'apple', _rev: 2 }, () => {
      return this.col.cacheOne({ _id: "1", a: 'banana', _rev: 1 }, () => {
        return this.col.find({}).fetch(function(results) {
          assert.equal(results[0].a, 'apple');
          return done();
        });
      });
    });
  });
});
