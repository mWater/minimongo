let IndexedDb;
import _ from 'lodash';
import async from 'async';
import IDBStore from 'idb-wrapper';
import { createUid } from './utils';
import { processFind } from './utils';
import { compileSort } from './selector';

// Create a database backed by IndexedDb. options must contain namespace: <string to uniquely identify database>
export default IndexedDb = class IndexedDb {
  constructor(options, success, error) {
    this.collections = {};

    // Create database
    this.store = new IDBStore({
      dbVersion: 1,
      storeName: 'minimongo_' + options.namespace,
      keyPath: ['col', 'doc._id'],
      autoIncrement: false,
      onStoreReady: () => { if (success) { return success(this); } },
      onError: error,
      indexes: [
        { name: 'col', keyPath: 'col', unique: false, multiEntry: false },
        { name: 'col-state', keyPath: ['col', 'state'], unique: false, multiEntry: false}
      ]
    });
  }

  addCollection(name, success, error) {
    const collection = new Collection(name, this.store);
    this[name] = collection;
    this.collections[name] = collection;
    if (success) {
      return success();
    }
  }

  removeCollection(name, success, error) {
    delete this[name];
    delete this.collections[name];

    // Remove all documents
    return this.store.query(matches => {
      const keys = _.map(matches, m => [ m.col, m.doc._id ]);
      if (keys.length > 0) {
        return this.store.removeBatch(keys, function() {
          if (success != null) { return success(); }
        }
        , error);
      } else {
        if (success != null) { return success(); }
      }
    }
    , { index: "col", keyRange: this.store.makeKeyRange({only: name}), onError: error });
  }
};

// Stores data in indexeddb store
class Collection {
  constructor(name, store) {
    this.name = name;
    this.store = store;
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
    // Get all docs from collection
    return this.store.query(function(matches) {
      // Filter removed docs
      matches = _.filter(matches, m => m.state !== "removed");
      if (success != null) { return success(processFind(_.pluck(matches, "doc"), selector, options)); }
    }
    , { index: "col", keyRange: this.store.makeKeyRange({only: this.name}), onError: error });
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
    }

    const records = _.map(items, item => {
      return {
        col: this.name,
        state: "upserted",
        doc: item
      };
  });

    return this.store.putBatch(records, function() {
      if (success) { return success(doc); }
    }
    , error);
  }

  remove(id, success, error) {
    // Find record
    return this.store.get([this.name, id], record => {
      // If not found, create placeholder record
      if ((record == null)) {
        record = {
          col: this.name,
          doc: { _id: id }
        };
      }

      // Set removed
      record.state = "removed";

      // Update
      return this.store.put(record, function() {
        if (success) { return success(id); }
      }
      , error);
    });
  }

  cache(docs, selector, options, success, error) {
    const step2 = () => {
      // Rows have been cached, now look for stale ones to remove
      let sort;
      const docsMap = _.object(_.pluck(docs, "_id"), docs);

      if (options.sort) {
        sort = compileSort(options.sort);
      }

      // Perform query, removing rows missing in docs from local db
      return this.find(selector, options).fetch(results => {
        const removes = [];
        const keys = _.map(results, result => [this.name, result._id]);
        if (keys.length === 0) {
          if (success != null) { success(); }
          return;
        }
        return this.store.getBatch(keys, records => {
          for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            const record = records[i];
            const result = results[i];

            // If not present in docs and is present locally and not upserted/deleted
            if (!docsMap[result._id] && record && (record.state === "cached")) {
              // If past end on sorted limited, ignore
              if (options.sort && options.limit && (docs.length === options.limit)) {
                if (sort(result, _.last(docs)) >= 0) {
                  continue;
                }
              }

              // Item is gone from server, remove locally
              removes.push([this.name, result._id]);
            }
          }

          // If removes, handle them
          if (removes.length > 0) {
            return this.store.removeBatch(removes, function() {
              if (success != null) { return success(); }
            }
            , error);
          } else {
            if (success != null) { return success(); }
          }
        }
        , error);
      }
      , error);
    };

    if (docs.length === 0) {
      return step2();
    }

    // Create keys to get items
    const keys = _.map(docs, doc => [this.name, doc._id]);

    // Create batch of puts
    const puts = [];
    return this.store.getBatch(keys, records => {
      // Add all non-local that are not upserted or removed
      for (let i = 0, end = records.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        const record = records[i];
        const doc = docs[i];

        // Check if not present or not upserted/deleted
        if ((record == null) || (record.state === "cached")) {
          // If _rev present, make sure that not overwritten by lower _rev
          if (!record || !doc._rev || !record.doc._rev || (doc._rev >= record.doc._rev)) {
            puts.push({ col: this.name, state: "cached", doc });
          }
        }
      }

      // Put batch
      if (puts.length > 0) {
        return this.store.putBatch(puts, step2, error);
      } else {
        return step2();
      }
    }
    , error);
  }

  pendingUpserts(success, error) {
    return this.store.query(function(matches) {
      if (success != null) { return success(_.pluck(matches, "doc")); }
    }
    , { index: "col-state", keyRange: this.store.makeKeyRange({only: [this.name, "upserted"]}), onError: error });
  }

  pendingRemoves(success, error) {
    return this.store.query(function(matches) {
      if (success != null) { return success(_.pluck(_.pluck(matches, "doc"), "_id")); }
    }
    , { index: "col-state", keyRange: this.store.makeKeyRange({only: [this.name, "removed"]}), onError: error });
  }

  resolveUpsert(doc, success, error) {
    // Handle both single and multiple upsert
    let items = doc;
    if (!_.isArray(items)) {
      items = [items];
    }

    // Get items
    const keys = _.map(items, item => [this.name, item._id]);
    return this.store.getBatch(keys, records => {
      const puts = [];
      for (let i = 0, end = items.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        const record = records[i];

        // Only safely remove upsert if doc is the same
        if (record && (record.state === "upserted") && _.isEqual(record.doc, items[i])) {
          record.state = "cached";
          puts.push(record);
        }
      }

      // Put all changed items
      if (puts.length > 0) {
        return this.store.putBatch(puts, function() {
          if (success) { return success(doc); }
        }
        , error);
      } else {
        if (success) { return success(doc); }
      }
    }
    , error);
  }

  resolveRemove(id, success, error) {
    return this.store.get([this.name, id], record => {
      // Only remove if removed
      if (record.state === "removed") {
        return this.store.remove([this.name, id], function() {
          if (success != null) { return success(); }
        }
        , error);
      }
    });
  }

  // Add but do not overwrite or record as upsert
  seed(doc, success, error) {
    return this.store.get([this.name, doc._id], record => {
      if ((record == null)) {
        record = {
          col: this.name,
          state: "cached",
          doc
        };
        return this.store.put(record, function() {
          if (success != null) { return success(); }
        }
        , error);
      } else {
        if (success != null) { return success(); }
      }
    });
  }

  // Add but do not overwrite upsert/removed and do not record as upsert
  cacheOne(doc, success, error) {
    return this.store.get([this.name, doc._id], record => {
      // If _rev present, make sure that not overwritten by lower _rev
      if (record && doc._rev && record.doc._rev && (doc._rev < record.doc._rev)) {
        if (success != null) { success(); }
        return;
      }

      if ((record == null)) {
        record = {
          col: this.name,
          state: "cached",
          doc
        };
      }
      if (record.state === "cached") {
        record.doc = doc;
        return this.store.put(record, function() {
          if (success != null) { return success(); }
        }
        , error);
      } else {
        if (success != null) { return success(); }
      }
    });
  }
}
