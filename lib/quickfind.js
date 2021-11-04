"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeResponse = exports.encodeResponse = exports.encodeRequest = void 0;
const lodash_1 = __importDefault(require("lodash"));
const js_sha1_1 = __importDefault(require("js-sha1"));
const selector_1 = require("./selector");
/*

Quickfind protocol allows sending information about which rows are already present locally to minimize
network traffic.

Protocal has 3 phases:

encodeRequest: Done on client. Summarize which rows are already present locally by sharding and then hashing _id:_rev|
encodeResponse: Done on server. Given complete server list and results of encodeRequest, create list of changes, sharded by first two characters of _id
decodeResponse: Done on client. Given encoded response and local list, recreate complete list from server.

Interaction of sort, limit and fields:

- fields present: _rev might be missing. Do not use quickfind
- limit with no sort: This gives unstable results. Do not use quickfind
- sort: final rows need to be re-sorted. Since fields not present, is possible.
- no sort, no limit: always sort by _id

*/
// Characters to shard by of _id
const shardLength = 2;
// Given an array of client rows, create a summary of which rows are present
function encodeRequest(clientRows) {
    // Index by shard
    clientRows = lodash_1.default.groupBy(clientRows, (row) => row._id.substr(0, shardLength));
    // Hash each one
    const request = lodash_1.default.mapValues(clientRows, (rows) => hashRows(rows));
    return request;
}
exports.encodeRequest = encodeRequest;
// Given an array of rows on the server and an encoded request, create encoded response
function encodeResponse(serverRows, encodedRequest) {
    // Index by shard
    serverRows = lodash_1.default.groupBy(serverRows, (row) => row._id.substr(0, shardLength));
    // Include any that are in encoded request but not present
    for (let key in encodedRequest) {
        const value = encodedRequest[key];
        if (!serverRows[key]) {
            serverRows[key] = [];
        }
    }
    // Only keep ones where different from encoded request
    const response = lodash_1.default.pickBy(serverRows, (rows, key) => hashRows(rows) !== encodedRequest[key]);
    return response;
}
exports.encodeResponse = encodeResponse;
// Given encoded response and array of client rows, create array of server rows
function decodeResponse(encodedResponse, clientRows, sort) {
    // Index by shard
    clientRows = lodash_1.default.groupBy(clientRows, (row) => row._id.substr(0, shardLength));
    // Overwrite with response
    let serverRows = lodash_1.default.extend(clientRows, encodedResponse);
    // Flatten
    serverRows = lodash_1.default.flatten(lodash_1.default.values(serverRows));
    // Sort
    if (sort) {
        serverRows.sort((0, selector_1.compileSort)(sort));
    }
    else {
        serverRows = lodash_1.default.sortBy(serverRows, "_id");
    }
    return serverRows;
}
exports.decodeResponse = decodeResponse;
function hashRows(rows) {
    const hash = js_sha1_1.default.create();
    for (let row of lodash_1.default.sortBy(rows, "_id")) {
        hash.update(row._id + ":" + (row._rev || "") + "|");
    }
    // 80 bits is enough for uniqueness
    return hash.hex().substr(0, 20);
}
