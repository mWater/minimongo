# Changelog
All notable changes to this project will be documented in this file.

## [5.0.0]

* RemoteDb now does bulk upserting when passed multiple docs. Before it would use async.eachSeries
* RemoteDb now calls PATCH on collection directly, not collection/:id
