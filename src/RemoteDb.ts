import _ from "lodash"
import * as utils from "./utils"
import jQueryHttpClient from "./jQueryHttpClient"
import * as quickfind from "./quickfind"
import { MinimongoDb, MinimongoCollection, Doc, MinimongoCollectionFindOptions, MinimongoCollectionFindOneOptions } from "./types"
import { MinimongoBaseCollection } from "."

export default class RemoteDb implements MinimongoDb {
  collections: { [collectionName: string]: Collection<any> }
  url: string | string[]
  client: string | null | undefined
  httpClient: any
  useQuickFind: boolean
  usePostFind: boolean

  /** Url must have trailing /, can be an arrau of URLs
   * useQuickFind enables the quickfind protocol for finds
   * usePostFind enables POST for find
   */
  constructor(url: string | string[], client?: string | null, httpClient?: any, useQuickFind = false, usePostFind = false) {
    this.url = url
    this.client = client
    this.collections = {}
    this.httpClient = httpClient
    this.useQuickFind = useQuickFind
    this.usePostFind = usePostFind
  }

  // Can specify url of specific collection as option.
  // useQuickFind can be overridden in options
  // usePostFind can be overridden in options
  addCollection(name: string, options: { url?: string, useQuickFind?: boolean, usePostFind?: boolean } = {}, success: any, error: any) {
    let url
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    if (options.url) {
      ;({ url } = options)
    } else {
      if (_.isArray(this.url)) {
        url = _.map(this.url, (url: any) => url + name)
      } else {
        url = this.url + name
      }
    }

    let { useQuickFind } = this
    if (options.useQuickFind != null) {
      ;({ useQuickFind } = options)
    }

    let { usePostFind } = this
    if (options.usePostFind != null) {
      ;({ usePostFind } = options)
    }

    const collection = new Collection(name, url, this.client, this.httpClient, useQuickFind, usePostFind)
    this[name] = collection
    this.collections[name] = collection
    if (success != null) {
      return success()
    }
  }

  removeCollection(name: any, success: any, error: any) {
    delete this[name]
    delete this.collections[name]
    if (success != null) {
      return success()
    }
  }

  getCollectionNames() {
    return _.keys(this.collections)
  }
}

// Remote collection on server
class Collection<T extends Doc> implements MinimongoBaseCollection<T> {
  name: any
  url: any
  client: any
  httpClient: any
  useQuickFind: any
  usePostFind: any
  
  // usePostFind allows POST to <collection>/find for long selectors
  constructor(name: any, url: any, client: any, httpClient: any, useQuickFind: any, usePostFind: any) {
    this.name = name
    this.url = url
    this.client = client
    this.httpClient = httpClient || jQueryHttpClient
    this.useQuickFind = useQuickFind
    this.usePostFind = usePostFind
  }

  getUrl() {
    let url
    if (_.isArray(this.url)) {
      url = this.url.pop()
      // Add the URL to the front of the array
      this.url.unshift(url)
      return url
    }
    return this.url
  }

  // error is called with jqXHR
  find(selector: any, options: MinimongoCollectionFindOptions = {}) { 
    return {
      fetch: (success: any, error: any) => {
        // Determine method: "get", "post" or "quickfind"
        // If in quickfind and localData present and (no fields option or _rev included) and not (limit with no sort), use quickfind
        let method
        if (
          this.useQuickFind &&
          options.localData &&
          (!options.fields || options.fields._rev) &&
          !(options.limit && !options.sort && !options.orderByExprs)
        ) {
          method = "quickfind"
          // If selector or fields or sort is too big, use post
        } else if (
          this.usePostFind &&
          JSON.stringify({ selector, sort: options.sort, fields: options.fields }).length > 500
        ) {
          method = "post"
        } else {
          method = "get"
        }

        if (method === "get") {
          // Create url
          const params: any = {}
          params.selector = JSON.stringify(selector || {})
          if (options.sort) {
            params.sort = JSON.stringify(options.sort)
          }
          if (options.limit) {
            params.limit = options.limit
          }
          if (options.skip) {
            params.skip = options.skip
          }
          if (options.fields) {
            params.fields = JSON.stringify(options.fields)
          }

          // Advanced options for mwater-expression-based filtering and ordering
          if (options.whereExpr) {
            params.whereExpr = JSON.stringify(options.whereExpr)
          }
          if (options.orderByExprs) {
            params.orderByExprs = JSON.stringify(options.orderByExprs)
          }

          if (this.client) {
            params.client = this.client
          }
          this.httpClient("GET", this.getUrl(), params, null, success, error)
          return
        }

        // Create body + params for quickfind and post
        const body = {
          selector: selector || {}
        } as any
        if (options.sort) {
          body.sort = options.sort
        }
        if (options.limit != null) {
          body.limit = options.limit
        }
        if (options.skip != null) {
          body.skip = options.skip
        }
        if (options.fields) {
          body.fields = options.fields
        }

        // Advanced options for mwater-expression-based filtering and ordering
        if (options.whereExpr) {
          body.whereExpr = options.whereExpr
        }
        if (options.orderByExprs) {
          body.orderByExprs = options.orderByExprs
        }

        const params: any = {}
        if (this.client) {
          params.client = this.client
        }

        if (method === "quickfind") {
          // Send quickfind data
          body.quickfind = quickfind.encodeRequest(options.localData)

          this.httpClient(
            "POST",
            this.getUrl() + "/quickfind",
            params,
            body,
            (encodedResponse: any) => {
              return success(quickfind.decodeResponse(encodedResponse, options.localData, options.sort))
            },
            error
          )
          return
        }

        // POST method
        return this.httpClient(
          "POST",
          this.getUrl() + "/find",
          params,
          body,
          (response: any) => {
            return success(response)
          },
          error
        )
      }
    }
  }

  // error is called with jqXHR
  // Note that findOne is not used by HybridDb, but rather find with limit is used
  findOne(selector: any, options: MinimongoCollectionFindOneOptions, success: (doc: T | null) => void, error: (err: any) => void): void
  findOne(selector: any, success: (doc: T | null) => void, error: (err: any) => void): void
  findOne(selector: any, options: any, success: any, error?: any) {
    if (_.isFunction(options)) {
      ;[options, success, error] = [{}, options, success]
    }

    // Create url
    const params: any = {}
    if (options.sort) {
      params.sort = JSON.stringify(options.sort)
    }
    params.limit = 1
    if (this.client) {
      params.client = this.client
    }
    params.selector = JSON.stringify(selector || {})

    return this.httpClient(
      "GET",
      this.getUrl(),
      params,
      null,
      function (results: any) {
        if (results && results.length > 0) {
          return success(results[0])
        } else {
          return success(null)
        }
      },
      error
    )
  }

  // error is called with jqXHR
  upsert(docs: any, bases: any, success: any, error?: any) {
    let items
    ;[items, success, error] = utils.regularizeUpsert(docs, bases, success, error)

    const results = []

    // Check if bases present
    const basesPresent = _.compact(_.map(items, "base")).length > 0

    const params: any = {}
    if (this.client) {
      params.client = this.client
    }

    // Handle single case
    if (items.length === 1) {
      // POST if no base, PATCH otherwise
      if (basesPresent) {
        return this.httpClient(
          "PATCH",
          this.getUrl(),
          params,
          items[0],
          function (result: any) {
            if (_.isArray(docs)) {
              return success([result])
            } else {
              return success(result)
            }
          },
          function (err: any) {
            if (error) {
              return error(err)
            }
          }
        )
      } else {
        return this.httpClient(
          "POST",
          this.getUrl(),
          params,
          items[0].doc,
          function (result: any) {
            if (_.isArray(docs)) {
              return success([result])
            } else {
              return success(result)
            }
          },
          function (err: any) {
            if (error) {
              return error(err)
            }
          }
        )
      }
    } else {
      // POST if no base, PATCH otherwise
      if (basesPresent) {
        return this.httpClient(
          "PATCH",
          this.getUrl(),
          params,
          { doc: _.map(items, "doc"), base: _.map(items, "base") },
          (result: any) => success(result),
          function (err: any) {
            if (error) {
              return error(err)
            }
          }
        )
      } else {
        return this.httpClient(
          "POST",
          this.getUrl(),
          params,
          _.map(items, "doc"),
          (result: any) => success(result),
          function (err: any) {
            if (error) {
              return error(err)
            }
          }
        )
      }
    }
  }

  // error is called with jqXHR
  remove(id: any, success: any, error: any) {
    if (!this.client) {
      throw new Error("Client required to remove")
    }

    const params = { client: this.client }
    return this.httpClient("DELETE", this.getUrl() + "/" + id, params, null, success, function (err: any) {
      // 410 is an acceptable delete status
      if (err.status === 410) {
        return success()
      } else {
        return error(err)
      }
    })
  }
}
