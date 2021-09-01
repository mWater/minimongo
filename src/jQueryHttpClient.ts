// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import $ from 'jquery';

// Create default JSON http client
export default function(method, url, params, data, success, error) {
  // Append
  let req;
  const fullUrl = url + "?" + $.param(params);

  if (method === "GET") {
    // Use longer timeout for gets
    req = $.ajax(fullUrl, {
      dataType: "json",
      timeout: 180000
    });
  } else if (method === "DELETE") {
    // Add timeout to prevent hung update requests
    req = $.ajax(fullUrl, { type: 'DELETE', timeout: 60000 });
  } else if ((method === "POST") || (method === "PATCH")) {
    req = $.ajax(fullUrl, {
      data: JSON.stringify(data),
      contentType: 'application/json',
      // Add timeout to prevent hung update requests
      timeout: 60000,
      type: method});
  } else {
    throw new Error(`Unknown method ${method}`);
  }

  req.done((response, textStatus, jqXHR) => success(response || null));
  return req.fail(function(jqXHR, textStatus, errorThrown) {
    if (error) {
      return error(jqXHR);
    }
  });
};
