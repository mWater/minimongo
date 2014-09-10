# Minimongo

A client-side MongoDB implementation which supports basic queries, including some geospatial ones.

Uses code from Meteor.js minimongo package, reworked to support more geospatial queries and made npm+browserify friendly.

It is either IndexedDb backed (IndexedDb), WebSQL backed (WebSQLDb), Local storage backed (LocalStorageDb) or in memory only (MemoryDb).

Autoselection is possible with utils.autoselectLocalDb(options, success, error)

## Usage

Minimongo is designed to be used with browserify.

```javascript

// Require minimongo
var minimongo = require("minimongo");

var LocalDb = minimongo.MemoryDb;

// Create local db (in memory database with no backing)
db = new LocalDb();

// Add a collection to the database
db.addCollection("animals");

doc = { species: "dog", name: "Bingo" };

// Always use upsert for both inserts and modifies
db.animals.upsert(doc, function() {
	// Success:

	// Query dog (with no query options beyond a selector)
	db.animals.findOne({ species:"dog" }, {}, function(res) {
		console.log("Dog's name is: " + res.name);
	});
});
```

### Upserting

`db.sometable.upsert(doc, success, error)` can take either a single document or multiple documents (array) for the first parameter.

*Note*: Only applies to local databases for now, not RemoteDb

### Resolving upserts

Upserts are stored in local databases in a special state to record that they are upserts, not cached rows. 

To resolve the upsert (for example once sent to central db), use resolveUpsert on collection

`db.sometable.resolveUpsert(doc, success, error)` can take either a single document or multiple documents (array) for the first parameter.

### IndexedDb

To make a database backed by IndexedDb:

```javascript

// Require minimongo
var minimongo = require("minimongo");

var IndexedDb = minimongo.IndexedDb;

// Create IndexedDb
db = new IndexedDb({namespace: "mydb"}, function() {
	// Add a collection to the database
	db.addCollection("animals", function() {
		doc = { species: "dog", name: "Bingo" };

		// Always use upsert for both inserts and modifies
		db.animals.upsert(doc, function() {
			// Success:

			// Query dog (with no query options beyond a selector)
			db.animals.findOne({ species:"dog" }, {}, function(res) {
				console.log("Dog's name is: " + res.name);
			});
		});
	});
}, function() { alert("some error!"); });

```

### Caching

Rows can be cached without creating a pending upsert. This is done automatically when HybridDb uploads to a remote database
with the returned upserted rows. It is also done when a query is performed on HybridDb: the results are cached in the local db
and the query is re-performed on the local database.

The field `_rev`, if present is used to prevent overwriting with older versions. This is the odd scenario where an updated version of a row
is present, but an older query to the server is delayed in returning. To prevent this race condition from giving stale data, the _rev
field is used.

### HybridDb

Queries the local database first and then returns remote data if different than local version. 

This approach allows fast responses but with subsequent correction if the server has differing information.

The HybridDb collections can also be created in non-caching mode, which is useful for storing up changes to be 
sent to a sever:

```
db.addCollection("sometable", { caching: false })
```

### RemoteDb

Uses AJAX-JSON calls to an API to query a real Mongo database. API is simple and contains only query, upsert and remove commands.

