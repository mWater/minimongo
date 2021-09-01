// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let MemoryDb;
import _ from 'lodash';
import { createUid } from './utils';
import { processFind } from './utils';
import { compileSort } from './selector';

export default MemoryDb = class MemoryDb {
  constructor(options, success) {
    this.collections = {};

    if (success) { success(this); }
  }

  addCollection(name, success, error) {
    const collection = new Collection(name);
    this[name] = collection;
    this.collections[name] = collection;
    if (success != null) { return success(); }
  }

  removeCollection(name, success, error) {
    delete this[name];
    delete this.collections[name];
    if (success != null) { return success(); }
  }
};

// Stores data in memory
class Collection {
  constructor(name) {
    this.name = name;

    this.items = {};
    this.upserts = {};  // Pending upserts by _id. Still in items
    this.removes = {};  // Pending removes by _id. No longer in items
  }

  find(selector, options) {
    return{ fetch: (success, error) => {
      return this._findFetch(selector, options, success, error);
    }
  };
  }

  findOne(selector, options, success, error) {
    if (_.isFunction(options)) {
      [options, success, error] = [{}, options, success];
    }

    return this.find(selector, options).fetch(function(results) {
      if (success != null) { return success(results.length>0 ? results[0] : null); }
    }
    , error);
  }

  _findFetch(selector, options, success, error) {
    if (success != null) { return success(processFind(this.items, selector, options)); }
  }

  upsert(doc, success, error) {
    // Handle both single and multiple upsert
    let items = doc;
    if (!_.isArray(items)) {
      items = [items];
    }

    for (let item of items) {
      if (!item._id) {
        item._id = createUid();
      }

      // Replace/add
      this.items[item._id] = item;
      this.upserts[item._id] = item;
    }

    if (success) { return success(doc); }
  }

  remove(id, success, error) {
    if (_.has(this.items, id)) {
      this.removes[id] = this.items[id];
      delete this.items[id];
      delete this.upserts[id];
    } else {
      this.removes[id] = { _id: id };
    }

    if (success != null) { return success(); }
  }

  cache(docs, selector, options, success, error) {
    // Add all non-local that are not upserted or removed
    let sort;
    for (let doc of docs) {
      this.cacheOne(doc);
    }

    const docsMap = _.object(_.pluck(docs, "_id"), docs);

    if (options.sort) {
      sort = compileSort(options.sort);
    }

    // Perform query, removing rows missing in docs from local db
    return this.find(selector, options).fetch(results => {
      for (let result of results) {
        if (!docsMap[result._id] && !_.has(this.upserts, result._id)) {
          // If past end on sorted limited, ignore
          if (options.sort && options.limit && (docs.length === options.limit)) {
            if (sort(result, _.last(docs)) >= 0) {
              continue;
            }
          }
          delete this.items[result._id];
        }
      }

      if (success != null) { return success(); }
    }
    , error);
  }

  pendingUpserts(success) {
    return success(_.values(this.upserts));
  }

  pendingRemoves(success) {
    return success(_.pluck(this.removes, "_id"));
  }

  resolveUpsert(doc, success) {
    // Handle both single and multiple upsert
    let items = doc;
    if (!_.isArray(items)) {
      items = [items];
    }

    for (let item of items) {
      if (this.upserts[item._id]) {
        // Only safely remove upsert if doc is unchanged
        if (_.isEqual(item, this.upserts[item._id])) {
          delete this.upserts[item._id];
        }
      }
    }
    if (success != null) { return success(); }
  }

  resolveRemove(id, success) {
    delete this.removes[id];
    if (success != null) { return success(); }
  }

  // Add but do not overwrite or record as upsert
  seed(doc, success) {
    if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
      this.items[doc._id] = doc;
    }
    if (success != null) { return success(); }
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc, success) {
    if (!_.has(this.upserts, doc._id) && !_.has(this.removes, doc._id)) {
      const existing = this.items[doc._id];

      // If _rev present, make sure that not overwritten by lower _rev
      if (!existing || !doc._rev || !existing._rev || (doc._rev >= existing._rev)) {
        this.items[doc._id] = doc;
      }
    }
    if (success != null) { return success(); }
  }
}
