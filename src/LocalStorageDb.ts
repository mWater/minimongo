// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let LocalStorageDb;
import _ from 'lodash';
import async from 'async';
import * as utils from './utils';
import { processFind } from './utils';
import { compileSort } from './selector';

export default LocalStorageDb = class LocalStorageDb {
  constructor(options, success) {
    this.collections = {};

    if (options && options.namespace && window.localStorage) {
      this.namespace = options.namespace;
    }

    if (success) { success(this); }
  }

  addCollection(name, success, error) {
    // Set namespace for collection
    let namespace;
    if (this.namespace) { namespace = this.namespace+"."+name; }

    const collection = new Collection(name, namespace);
    this[name] = collection;
    this.collections[name] = collection;
    if (success != null) { return success(); }
  }

  removeCollection(name, success, error) {
    if (this.namespace && window.localStorage) {
      const keys = [];
      for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        keys.push(window.localStorage.key(i));
      }

      for (let key of keys) {
        const keyToMatch = this.namespace + '.' + name;
        if (key.substring(0, keyToMatch.length) === keyToMatch) {
            window.localStorage.removeItem(key);
          }
      }
    }

    delete this[name];
    delete this.collections[name];
    if (success != null) { return success(); }
  }

  getCollectionNames() { return _.keys(this.collections); }
};


// Stores data in memory, optionally backed by local storage
class Collection {
  constructor(name, namespace) {
    this.name = name;
    this.namespace = namespace;

    this.items = {};
    this.upserts = {};  // Pending upserts by _id. Still in items
    this.removes = {};  // Pending removes by _id. No longer in items

    // Read from local storage
    if (window.localStorage && (namespace != null)) {
      this.loadStorage();
    }
  }

  loadStorage() {
    // Read items from localStorage
    let key;
    this.itemNamespace = this.namespace + "_";

    for (let i = 0, end = window.localStorage.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      key = window.localStorage.key(i);
      if (key.substring(0, this.itemNamespace.length) === this.itemNamespace) {
        const item = JSON.parse(window.localStorage[key]);
        this.items[item._id] = item;
      }
    }

    // Read upserts
    const upsertKeys = window.localStorage[this.namespace+"upserts"] ? JSON.parse(window.localStorage[this.namespace+"upserts"]) : [];
    for (key of upsertKeys) {
      this.upserts[key] = { doc: this.items[key] };
      // Get base if present
      const base = window.localStorage[this.namespace+"upsertbase_"+key] ? JSON.parse(window.localStorage[this.namespace+"upsertbase_"+key]) : null;
      this.upserts[key].base = base;
    }

    // Read removes
    const removeItems = window.localStorage[this.namespace+"removes"] ? JSON.parse(window.localStorage[this.namespace+"removes"]) : [];
    return this.removes = _.object(_.pluck(removeItems, "_id"), removeItems);
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
    // Deep clone to prevent modification
    if (success != null) { return success(processFind(_.cloneDeep(_.values(this.items)), selector, options)); }
  }

  upsert(docs, bases, success, error) {
    let items;
    [items, success, error] = utils.regularizeUpsert(docs, bases, success, error);

    // Keep independent copies to prevent modification
    items = JSON.parse(JSON.stringify(items));

    for (let item of items) {
      // Fill in base
      if (item.base === undefined) {
        // Use existing base
        if (this.upserts[item.doc._id]) {
          item.base = this.upserts[item.doc._id].base;
        } else {
          item.base = this.items[item.doc._id] || null;
        }
      }

      // Keep independent copies
      item = _.cloneDeep(item);

      // Replace/add
      this._putItem(item.doc);
      this._putUpsert(item);
    }

    if (success) { return success(docs); }
  }

  remove(id, success, error) {
    // Special case for filter-type remove
    if (_.isObject(id)) {
      this.find(id).fetch(rows => {
        return async.each(rows, (row, cb) => {
          return this.remove(row._id, (() => cb()), cb);
        }
        , () => success());
      }
      , error);
      return;
    }

    if (_.has(this.items, id)) {
      this._putRemove(this.items[id]);
      this._deleteItem(id);
      this._deleteUpsert(id);
    } else {
      this._putRemove({ _id: id });
    }

    if (success != null) { return success(); }
  }

  _putItem(doc) {
    this.items[doc._id] = doc;
    if (this.namespace) {
      return window.localStorage[this.itemNamespace + doc._id] = JSON.stringify(doc);
    }
  }

  _deleteItem(id) {
    delete this.items[id];
    if (this.namespace) {
      return window.localStorage.removeItem(this.itemNamespace + id);
    }
  }

  _putUpsert(upsert) {
    this.upserts[upsert.doc._id] = upsert;
    if (this.namespace) {
      window.localStorage[this.namespace+"upserts"] = JSON.stringify(_.keys(this.upserts));
      return window.localStorage[this.namespace+"upsertbase_"+upsert.doc._id] = JSON.stringify(upsert.base);
    }
  }

  _deleteUpsert(id) {
    delete this.upserts[id];
    if (this.namespace) {
      return window.localStorage[this.namespace+"upserts"] = JSON.stringify(_.keys(this.upserts));
    }
  }

  _putRemove(doc) {
    this.removes[doc._id] = doc;
    if (this.namespace) {
      return window.localStorage[this.namespace+"removes"] = JSON.stringify(_.values(this.removes));
    }
  }

  _deleteRemove(id) {
    delete this.removes[id];
    if (this.namespace) {
      return window.localStorage[this.namespace+"removes"] = JSON.stringify(_.values(this.removes));
    }
  }

  cache(docs, selector, options, success, error) {
    // Add all non-local that are not upserted or removed
    let sort;
    for (let doc of docs) {
      // Exclude any excluded _ids from being cached/uncached
      if (options && options.exclude && options.exclude.includes(doc._id)) {
        continue;
      }

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
          // Exclude any excluded _ids from being cached/uncached
          if (options && options.exclude && options.exclude.includes(result._id)) {
            continue;
          }

          // If at limit
          if (options.limit && (docs.length === options.limit)) {
            // If past end on sorted limited, ignore
            if (options.sort && (sort(result, _.last(docs)) >= 0)) {
              continue;
            }
            // If no sort, ignore
            if (!options.sort) {
              continue;
            }
          }

          this._deleteItem(result._id);
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

  resolveUpserts(upserts, success) {
    for (let upsert of upserts) {
      if (this.upserts[upsert.doc._id]) {
        // Only safely remove upsert if item is unchanged
        if (_.isEqual(upsert.doc, this.upserts[upsert.doc._id].doc)) {
          this._deleteUpsert(upsert.doc._id);
        } else {
          // Just update base
          this.upserts[upsert.doc._id].base = upsert.doc;
          this._putUpsert(this.upserts[upsert.doc._id]);
        }
      }
    }
    if (success != null) { return success(); }
  }

  resolveRemove(id, success) {
    this._deleteRemove(id);
    if (success != null) { return success(); }
  }

  // Add but do not overwrite or record as upsert
  seed(docs, success) {
    if (!_.isArray(docs)) {
      docs = [docs];
    }

    for (let doc of docs) {
      if (!_.has(this.items, doc._id) && !_.has(this.removes, doc._id)) {
        this._putItem(doc);
      }
    }
    if (success != null) { return success(); }
  }

  // Add but do not overwrite upserts or removes
  cacheOne(doc, success, error) {
    return this.cacheList([doc], success, error);
  }

  // Add but do not overwrite upserts or removes
  cacheList(docs, success) {
    for (let doc of docs) {
      if (!_.has(this.upserts, doc._id) && !_.has(this.removes, doc._id)) {
        const existing = this.items[doc._id];

        // If _rev present, make sure that not overwritten by lower or equal _rev
        if (!existing || !doc._rev || !existing._rev || (doc._rev > existing._rev)) {
          this._putItem(doc);
        }
      }
    }
    if (success != null) { return success(); }
  }

  uncache(selector, success, error) {
    const compiledSelector = utils.compileDocumentSelector(selector);

    for (let item of _.values(this.items)) {
      if ((this.upserts[item._id] == null) && compiledSelector(item)) {
        this._deleteItem(item._id);
      }
    }

    if (success != null) { return success(); }
  }

  uncacheList(ids, success, error) {
    for (let id of ids) {
      if ((this.upserts[id] == null)) {
        this._deleteItem(id);
      }
    }

    if (success != null) { return success(); }
  }
}
