// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*

Database which caches locally in a localDb but pulls results
ultimately from a RemoteDb

*/

let HybridDb;
import _ from 'lodash';
import { processFind } from './utils';

export default HybridDb = class HybridDb {
  constructor(localDb, remoteDb) {
    this.localDb = localDb;
    this.remoteDb = remoteDb;
    this.collections = {};
  }

  addCollection(name, options, success, error) {
    // Shift options over if not present
    if (_.isFunction(options)) {
      [options, success, error] = [{}, options, success];
    }

    const collection = new HybridCollection(name, this.localDb[name], this.remoteDb[name], options);
    this[name] = collection;
    this.collections[name] = collection;
    if (success != null) { return success(); }
  }

  removeCollection(name, success, error) {
    delete this[name];
    delete this.collections[name];
    if (success != null) { return success(); }
  }

  upload(success, error) {
    const cols = _.values(this.collections);

    function uploadCols(cols, success, error) {
      const col = _.first(cols);
      if (col) {
        return col.upload(() => uploadCols(_.rest(cols), success, error)
        , err => error(err));
      } else {
        return success();
      }
    }

    return uploadCols(cols, success, error);
  }
};

class HybridCollection {
  // Options includes
  constructor(name, localCol, remoteCol, options) {
    this.name = name;
    this.localCol = localCol;
    this.remoteCol = remoteCol;

    // Default options
    options = options || {};
    _.defaults(options, { caching: true });

    // Extract options
    this.caching = options.caching;
  }

  // options.mode defaults to "hybrid" (unless caching=false, in which case "remote")
  // In "hybrid", it will return local results, then hit remote and return again if different
  // If remote gives error, it will be ignored
  // In "remote", it will call remote and not cache, but integrates local upserts/deletes
  // If remote gives error, then it will return local results
  // In "local", just returns local results
  find(selector, options = {}) {
    return{ fetch: (success, error) => {
      return this._findFetch(selector, options, success, error);
    }
  };
  }

  // options.mode defaults to "hybrid".
  // In "hybrid", it will return local if present, otherwise fall to remote without returning null
  // If remote gives error, then it will return null if none locally. If remote and local differ, it
  // will return twice
  // In "local", it will return local if present. If not present, only then will it hit remote.
  // If remote gives error, then it will return null
  // In "remote", it gets remote and integrates local changes. Much more efficient if _id specified
  // If remote gives error, falls back to local if caching
  findOne(selector, options = {}, success, error) {
    if (_.isFunction(options)) {
      [options, success, error] = [{}, options, success];
    }

    const mode = options.mode || (this.caching ? "hybrid" : "remote");

    if ((mode === "hybrid") || (mode === "local")) {
      options.limit = 1;
      return this.localCol.findOne(selector, options, localDoc => {
        // If found, return
        if (localDoc) {
          success(localDoc);
          // No need to hit remote if local
          if (mode === "local") {
            return;
          }
        }

        const remoteSuccess = remoteDoc => {
          // Cache
          const cacheSuccess = () => {
            // Try query again
            return this.localCol.findOne(selector, options, function(localDoc2) {
              if (!_.isEqual(localDoc, localDoc2)) {
                return success(localDoc2);
              } else if (!localDoc) {
                return success(null);
              }
            });
          };

          const docs = remoteDoc ? [remoteDoc] : [];
          return this.localCol.cache(docs, selector, options, cacheSuccess, error);
        };

        function remoteError() {
          // Remote errored out. Return null if local did not return
          if (!localDoc) {
            return success(null);
          }
        }

        // Call remote
        return this.remoteCol.findOne(selector, _.omit(options, 'fields'), remoteSuccess, remoteError);
      }
      , error);
    } else if (mode === "remote") {
      // If _id specified, use remote findOne
      if (selector._id) {
        const remoteSuccess2 = remoteData => {
          // Check for local upsert
          return this.localCol.pendingUpserts(pendingUpserts => {
            const localData = _.findWhere(pendingUpserts, { _id: selector._id });
            if (localData) {
              return success(localData);
            }

            // Check for local remove
            return this.localCol.pendingRemoves(function(pendingRemoves) {
              if (pendingRemoves.includes(selector._id)) {
                // Removed, success null
                return success(null);
              }

              return success(remoteData);
            });
          }
          , error);
        };

        // Get remote response
        return this.remoteCol.findOne(selector, options, remoteSuccess2, error);
      } else {
        // Without _id specified, interaction between local and remote changes is complex
        // For example, if the one result returned by remote is locally deleted, we have no fallback
        // So instead we do a normal find and then take the first result, which is very inefficient
        return this.find(selector, options).fetch(function(findData) {
          if (findData.length > 0) {
            return success(findData[0]);
          } else {
            return success(null);
          }
        }
        , err => {
          // Call local if caching
          if (this.caching) {
            return this.localCol.findOne(selector, options, success, error);
          } else {
            // Otherwise bubble up
            if (error) {
              return error(err);
            }
          }
        });
      }

    } else {
      throw new Error("Unknown mode");
    }
  }

  _findFetch(selector, options, success, error) {
    const mode = options.mode || (this.caching ? "hybrid" : "remote");

    if (mode === "hybrid") {
      // Get local results
      const localSuccess = localData => {
        // Return data immediately
        success(localData);

        // Get remote data
        const remoteSuccess = remoteData => {
          // Cache locally
          const cacheSuccess = () => {
            // Get local data again
            function localSuccess2(localData2) {
              // Check if different
              if (!_.isEqual(localData, localData2)) {
                // Send again
                return success(localData2);
              }
            }

            return this.localCol.find(selector, options).fetch(localSuccess2, error);
          };
          return this.localCol.cache(remoteData, selector, options, cacheSuccess, error);
        };
        return this.remoteCol.find(selector, _.omit(options, "fields")).fetch(remoteSuccess);
      };

      return this.localCol.find(selector, options).fetch(localSuccess, error);
    } else if (mode === "local") {
      return this.localCol.find(selector, options).fetch(success, error);
    } else if (mode === "remote") {
      // Get remote results
      const remoteSuccess = remoteData => {
        // Remove local remotes
        let data = remoteData;

        return this.localCol.pendingRemoves(removes => {
          if (removes.length > 0) {
            const removesMap = _.object(_.map(removes, id => [id, id]));
            data = _.filter(remoteData, doc => !_.has(removesMap, doc._id));
          }

          // Add upserts
          return this.localCol.pendingUpserts(function(upserts) {
            if (upserts.length > 0) {
              // Remove upserts from data
              const upsertsMap = _.object(_.pluck(upserts, '_id'), _.pluck(upserts, '_id'));
              data = _.filter(data, doc => !_.has(upsertsMap, doc._id));

              // Add upserts
              data = data.concat(upserts);

              // Refilter/sort/limit
              data = processFind(data, selector, options);
            }

            return success(data);
          });
        });
      };

      const remoteError = err => {
        // Call local if caching
        if (this.caching) {
          return this.localCol.find(selector, options).fetch(success, error);
        } else {
          // Otherwise bubble up
          if (error) {
            return error(err);
          }
        }
      };

      return this.remoteCol.find(selector, options).fetch(remoteSuccess, remoteError);
    } else {
      throw new Error("Unknown mode");
    }
  }

  upsert(doc, success, error) {
    return this.localCol.upsert(doc, function(result) {
      if (success != null) { return success(result); }
    }
    , error);
  }

  remove(id, success, error) {
    return this.localCol.remove(id, function() {
      if (success != null) { return success(); }
    }
    , error);
  }

  upload(success, error) {
    var uploadUpserts = (upserts, success, error) => {
      const upsert = _.first(upserts);
      if (upsert) {
        return this.remoteCol.upsert(upsert, remoteDoc => {
          return this.localCol.resolveUpsert(upsert, () => {
            // Cache new value if caching
            if (this.caching) {
              return this.localCol.cacheOne(remoteDoc, () => uploadUpserts(_.rest(upserts), success, error)
              , error);
            } else {
              // Remove document
              return this.localCol.remove(upsert._id, () => {
                // Resolve remove
                return this.localCol.resolveRemove(upsert._id, () => uploadUpserts(_.rest(upserts), success, error)
                , error);
              }
              , error);
            }
          }
          , error);
        }
        , err => {
          // If 410 error or 403, remove document
          if ((err.status === 410) || (err.status === 403)) {
            return this.localCol.remove(upsert._id, () => {
              // Resolve remove
              return this.localCol.resolveRemove(upsert._id, function() {
                // Continue if was 410
                if (err.status === 410) {
                  return uploadUpserts(_.rest(upserts), success, error);
                } else {
                  return error(err);
                }
              }
              , error);
            }
            , error);
          } else {
            return error(err);
          }
        });
      } else {
        return success();
      }
    };

    var uploadRemoves = (removes, success, error) => {
      const remove = _.first(removes);
      if (remove) {
        return this.remoteCol.remove(remove, () => {
          return this.localCol.resolveRemove(remove, () => uploadRemoves(_.rest(removes), success, error)
          , error);
        }
        , err => {
          // If 403 or 410, remove document
          if ((err.status === 410) || (err.status === 403)) {
            return this.localCol.resolveRemove(remove, function() {
              // Continue if was 410
              if (err.status === 410) {
                return uploadRemoves(_.rest(removes), success, error);
              } else {
                return error(err);
              }
            }
            , error);
          } else {
            return error(err);
          }
        }
        , error);
      } else {
        return success();
      }
    };

    // Get pending upserts
    return this.localCol.pendingUpserts(upserts => {
      return uploadUpserts(upserts, () => {
        return this.localCol.pendingRemoves(removes => uploadRemoves(removes, success, error)
        , error);
      }
      , error);
    }
    , error);
  }
}
