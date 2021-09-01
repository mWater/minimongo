const context = require.context(/*directory*/ "mocha-loader!.", /*recursive*/ true, /*match files*/ /Tests.coffee$/)
context.keys().forEach(context)
