let RemoteDb;
import _ from 'lodash';
import $ from 'jquery';
import { createUid } from './utils';

export default RemoteDb = class RemoteDb {
  // Url must have trailing /
  constructor(url, client) {
    this.url = url;
    this.client = client;
    this.collections = {};
  }

  addCollection(name) {
    const collection = new Collection(name, this.url + name, this.client);
    this[name] = collection;
    return this.collections[name] = collection;
  }

  removeCollection(name) {
    delete this[name];
    return delete this.collections[name];
  }
};

// Remote collection on server
class Collection {
  constructor(name, url, client) {
    this.name = name;
    this.url = url;
    this.client = client;
  }

  // error is called with jqXHR
  find(selector, options = {}) {
    return { fetch: (success, error) => {
      // Create url
      const params = {};
      if (options.sort) {
        params.sort = JSON.stringify(options.sort);
      }
      if (options.limit) {
        params.limit = options.limit;
      }
      if (options.fields) {
        params.fields = JSON.stringify(options.fields);
      }
      if (this.client) {
        params.client = this.client;
      }
      params.selector = JSON.stringify(selector || {});

      // Add timestamp for Android 2.3.6 bug with caching
      if (navigator.userAgent.toLowerCase().indexOf('android 2.3') !== -1) {
        params._ = new Date().getTime();
      }

      const req = $.getJSON(this.url, params);
      req.done((data, textStatus, jqXHR) => success(data));
      return req.fail(function(jqXHR, textStatus, errorThrown) {
        if (error) {
          return error(jqXHR);
        }
      });
    }
  };
  }

  // error is called with jqXHR
  findOne(selector, options = {}, success, error) {
    if (_.isFunction(options)) {
      [options, success, error] = [{}, options, success];
    }

    // Create url
    const params = {};
    if (options.sort) {
      params.sort = JSON.stringify(options.sort);
    }
    params.limit = 1;
    if (this.client) {
      params.client = this.client;
    }
    params.selector = JSON.stringify(selector || {});

    // Add timestamp for Android 2.3.6 bug with caching
    if (navigator.userAgent.toLowerCase().indexOf('android 2.3') !== -1) {
      params._ = new Date().getTime();
    }

    const req = $.getJSON(this.url, params);
    req.done((data, textStatus, jqXHR) => success(data[0] || null));
    return req.fail(function(jqXHR, textStatus, errorThrown) {
      if (error) {
        return error(jqXHR);
      }
    });
  }

  // error is called with jqXHR
  upsert(doc, success, error) {
    let url;
    if (!this.client) {
      throw new Error("Client required to upsert");
    }

    if (!doc._id) {
      doc._id = createUid();
    }

    // Add timestamp for Android 2.3.6 bug with caching
    if (navigator.userAgent.toLowerCase().indexOf('android 2.3') !== -1) {
      url = this.url + "?client=" + this.client + "&_=" + new Date().getTime();
    } else {
      url = this.url + "?client=" + this.client;
    }

    const req = $.ajax(url, {
      data : JSON.stringify(doc),
      contentType : 'application/json',
      type : 'POST'});
    req.done((data, textStatus, jqXHR) => success(data || null));
    return req.fail(function(jqXHR, textStatus, errorThrown) {
      if (error) {
        return error(jqXHR);
      }
    });
  }

  // error is called with jqXHR
  remove(id, success, error) {
    if (!this.client) {
      throw new Error("Client required to remove");
    }

    const req = $.ajax(this.url + "/" + id + "?client=" + this.client, { type : 'DELETE'});
    req.done((data, textStatus, jqXHR) => success());
    return req.fail(function(jqXHR, textStatus, errorThrown) {
      // 410 means already deleted
      if (jqXHR.status === 410) {
        return success();
      } else if (error) {
        return error(jqXHR);
      }
    });
  }
}
