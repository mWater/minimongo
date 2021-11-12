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
exports.HybridCollection = exports.ReplicatingDb = exports.HybridDb = exports.RemoteDb = exports.WebSQLDb = exports.IndexedDb = exports.LocalStorageDb = exports.MemoryDb = exports.utils = exports.quickfind = void 0;
const quickfind = __importStar(require("./quickfind"));
exports.quickfind = quickfind;
const utils = __importStar(require("./utils"));
exports.utils = utils;
__exportStar(require("./types"), exports);
const MemoryDb_1 = __importDefault(require("./MemoryDb"));
Object.defineProperty(exports, "MemoryDb", { enumerable: true, get: function () { return MemoryDb_1.default; } });
const LocalStorageDb_1 = __importDefault(require("./LocalStorageDb"));
Object.defineProperty(exports, "LocalStorageDb", { enumerable: true, get: function () { return LocalStorageDb_1.default; } });
const IndexedDb_1 = __importDefault(require("./IndexedDb"));
Object.defineProperty(exports, "IndexedDb", { enumerable: true, get: function () { return IndexedDb_1.default; } });
const WebSQLDb_1 = __importDefault(require("./WebSQLDb"));
Object.defineProperty(exports, "WebSQLDb", { enumerable: true, get: function () { return WebSQLDb_1.default; } });
const RemoteDb_1 = __importDefault(require("./RemoteDb"));
Object.defineProperty(exports, "RemoteDb", { enumerable: true, get: function () { return RemoteDb_1.default; } });
const HybridDb_1 = __importStar(require("./HybridDb"));
Object.defineProperty(exports, "HybridDb", { enumerable: true, get: function () { return HybridDb_1.default; } });
Object.defineProperty(exports, "HybridCollection", { enumerable: true, get: function () { return HybridDb_1.HybridCollection; } });
const ReplicatingDb_1 = __importDefault(require("./ReplicatingDb"));
Object.defineProperty(exports, "ReplicatingDb", { enumerable: true, get: function () { return ReplicatingDb_1.default; } });
exports.default = { quickfind, utils, MemoryDb: MemoryDb_1.default, LocalStorageDb: LocalStorageDb_1.default, IndexedDb: IndexedDb_1.default, WebSQLDb: WebSQLDb_1.default, RemoteDb: RemoteDb_1.default, HybridDb: HybridDb_1.default, ReplicatingDb: ReplicatingDb_1.default, HybridCollection: HybridDb_1.HybridCollection };
