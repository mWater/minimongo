const context = require.context(/*directory*/ "mocha-loader!.", /*recursive*/ true, /*match files*/ /Tests.ts$/)
context.keys().forEach(context)
