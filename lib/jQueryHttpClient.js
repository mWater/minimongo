"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jquery_1 = __importDefault(require("jquery"));
// Create default JSON http client
function default_1(method, url, params, data, success, error) {
    // Append
    let req;
    const fullUrl = url + "?" + jquery_1.default.param(params);
    if (method === "GET") {
        // Use longer timeout for gets
        req = jquery_1.default.ajax(fullUrl, {
            dataType: "json",
            timeout: 180000
        });
    }
    else if (method === "DELETE") {
        // Add timeout to prevent hung update requests
        req = jquery_1.default.ajax(fullUrl, { type: "DELETE", timeout: 60000 });
    }
    else if (method === "POST" || method === "PATCH") {
        req = jquery_1.default.ajax(fullUrl, {
            data: JSON.stringify(data),
            contentType: "application/json",
            // Add timeout to prevent hung update requests
            timeout: 60000,
            type: method
        });
    }
    else {
        throw new Error(`Unknown method ${method}`);
    }
    req.done((response, textStatus, jqXHR) => success(response || null));
    return req.fail(function (jqXHR, textStatus, errorThrown) {
        if (error) {
            return error(jqXHR);
        }
    });
}
exports.default = default_1;
