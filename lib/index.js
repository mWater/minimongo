"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.utils = exports.quickfind = exports.ReplicatingDb = exports.HybridDb = exports.RemoteDb = exports.WebSQLDb = exports.IndexedDb = exports.LocalStorageDb = exports.MemoryDb = void 0;
const quickfind = __importStar(require("./quickfind"));
exports.quickfind = quickfind;
const utils = __importStar(require("./utils"));
exports.utils = utils;
__exportStar(require("./types"), exports);
var MemoryDb_1 = require("./MemoryDb");
Object.defineProperty(exports, "MemoryDb", { enumerable: true, get: function () { return __importDefault(MemoryDb_1).default; } });
var LocalStorageDb_1 = require("./LocalStorageDb");
Object.defineProperty(exports, "LocalStorageDb", { enumerable: true, get: function () { return __importDefault(LocalStorageDb_1).default; } });
var IndexedDb_1 = require("./IndexedDb");
Object.defineProperty(exports, "IndexedDb", { enumerable: true, get: function () { return __importDefault(IndexedDb_1).default; } });
var WebSQLDb_1 = require("./WebSQLDb");
Object.defineProperty(exports, "WebSQLDb", { enumerable: true, get: function () { return __importDefault(WebSQLDb_1).default; } });
var RemoteDb_1 = require("./RemoteDb");
Object.defineProperty(exports, "RemoteDb", { enumerable: true, get: function () { return __importDefault(RemoteDb_1).default; } });
var HybridDb_1 = require("./HybridDb");
Object.defineProperty(exports, "HybridDb", { enumerable: true, get: function () { return __importDefault(HybridDb_1).default; } });
var ReplicatingDb_1 = require("./ReplicatingDb");
Object.defineProperty(exports, "ReplicatingDb", { enumerable: true, get: function () { return __importDefault(ReplicatingDb_1).default; } });
