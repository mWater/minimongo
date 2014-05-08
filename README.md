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

### HybridDb

Queries the local database first and then returns remote data if different than local version. 

This approach allows fast responses but with subsequent correction if the server has differing information.


### RemoteDb

Uses AJAX-JSON calls to an API to query a real Mongo database. API is simple and contains only query, upsert and remove commands.