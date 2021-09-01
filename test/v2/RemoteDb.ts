// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let RemoteDb
import _ from "lodash"
import $ from "jquery"
import { createUid } from "./utils"

export default RemoteDb = class RemoteDb {
  // Url must have trailing /
  constructor(url: any, client: any) {
    this.url = url
    this.client = client
    this.collections = {}
  }

  addCollection(name: any) {
    const collection = new Collection(name, this.url + name, this.client)
    this[name] = collection
    return (this.collections[name] = collection)
  }

  removeCollection(name: any) {
    delete this[name]
    return delete this.collections[name]
  }
}

// Remote collection on server
class Collection {
  constructor(name: any, url: any, client: any) {
    this.name = name
    this.url = url
    this.client = client
  }

  // error is called with jqXHR
  find(selector: any, options = {}) {
    return {
      fetch: (success: any, error: any) => {
        // Create url
        const params = {}
        if (options.sort) {
          params.sort = JSON.stringify(options.sort)
        }
        if (options.limit) {
          params.limit = options.limit
        }
        if (options.fields) {
          params.fields = JSON.stringify(options.fields)
        }
        if (this.client) {
          params.client = this.client
        }
        params.selector = JSON.stringify(selector || {})

        // Add timestamp for Android 2.3.6 bug with caching
        if (navigator.userAgent.toLowerCase().indexOf("android 2.3") !== -1) {
          params._ = new Date().getTime()
        }

        const req = $.getJSON(this.url, params)
        req.done((data: any, textStatus: any, jqXHR: any) => success(data))
        return req.fail(function (jqXHR: any, textStatus: any, errorThrown: any) {
          if (error) {
            return error(jqXHR)
          }
        })
      }
    }
  }

  // error is called with jqXHR
  findOne(selector: any, options = {}, success: any, error: any) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    // Create url
    const params = {}
    if (options.sort) {
      params.sort = JSON.stringify(options.sort)
    }
    params.limit = 1
    if (this.client) {
      params.client = this.client
    }
    params.selector = JSON.stringify(selector || {})

    // Add timestamp for Android 2.3.6 bug with caching
    if (navigator.userAgent.toLowerCase().indexOf("android 2.3") !== -1) {
      params._ = new Date().getTime()
    }

    const req = $.getJSON(this.url, params)
    req.done((data: any, textStatus: any, jqXHR: any) => success(data[0] || null))
    return req.fail(function (jqXHR: any, textStatus: any, errorThrown: any) {
      if (error) {
        return error(jqXHR)
      }
    })
  }

  // error is called with jqXHR
  upsert(doc: any, success: any, error: any) {
    let url
    if (!this.client) {
      throw new Error("Client required to upsert")
    }

    if (!doc._id) {
      doc._id = createUid()
    }

    // Add timestamp for Android 2.3.6 bug with caching
    if (navigator.userAgent.toLowerCase().indexOf("android 2.3") !== -1) {
      url = this.url + "?client=" + this.client + "&_=" + new Date().getTime()
    } else {
      url = this.url + "?client=" + this.client
    }

    const req = $.ajax(url, {
      data: JSON.stringify(doc),
      contentType: "application/json",
      type: "POST"
    })
    req.done((data: any, textStatus: any, jqXHR: any) => success(data || null))
    return req.fail(function (jqXHR: any, textStatus: any, errorThrown: any) {
      if (error) {
        return error(jqXHR)
      }
    })
  }

  // error is called with jqXHR
  remove(id: any, success: any, error: any) {
    if (!this.client) {
      throw new Error("Client required to remove")
    }

    const req = $.ajax(this.url + "/" + id + "?client=" + this.client, { type: "DELETE" })
    req.done((data: any, textStatus: any, jqXHR: any) => success())
    return req.fail(function (jqXHR: any, textStatus: any, errorThrown: any) {
      // 410 means already deleted
      if (jqXHR.status === 410) {
        return success()
      } else if (error) {
        return error(jqXHR)
      }
    })
  }
}
