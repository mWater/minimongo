import $ from "jquery"

// Create default JSON http client
export default function (method: any, url: any, params: any, data: any, success: any, error: any) {
  // Append
  let req
  const fullUrl = url + "?" + $.param(params)

  if (method === "GET") {
    // Use longer timeout for gets
    req = $.ajax(fullUrl, {
      dataType: "json",
      timeout: 180000
    })
  } else if (method === "DELETE") {
    // Add timeout to prevent hung update requests
    req = $.ajax(fullUrl, { type: "DELETE", timeout: 60000 })
  } else if (method === "POST" || method === "PATCH") {
    req = $.ajax(fullUrl, {
      data: JSON.stringify(data),
      contentType: "application/json",
      // Add timeout to prevent hung update requests
      timeout: 60000,
      type: method
    })
  } else {
    throw new Error(`Unknown method ${method}`)
  }

  req.done((response: any, textStatus: any, jqXHR: any) => success(response || null))
  return req.fail(function (jqXHR: any, textStatus: any, errorThrown: any) {
    if (error) {
      return error(jqXHR)
    }
  })
}
