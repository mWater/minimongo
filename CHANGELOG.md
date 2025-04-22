# Changelog
All notable changes to this project will be documented in this file.

## [5.0.0]

* RemoteDb now does bulk upserting when passed multiple docs. Before it would use async.eachSeries
* RemoteDb now calls PATCH on collection directly, not collection/:id

## [7.0.0]

* Switch away from using WebSQL as an auto-selected database, except on iOS with the SQLite plugin.

## [7.1.0]

* Cleanup of WebSQLDb to use batching for finds
