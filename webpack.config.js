path = require('path');

module.exports = {
  entry: ['./index.js'],
  devtool: "source-map",
  output: {
    filename: 'minimongo.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    loaders: [
      { test: /\.coffee$/, loader: ["coffee-loader"] }
    ]
  },
  resolve: {
    extensions: [".coffee", ".js", ".json"]
  },
  externals: {
    lodash: '_',
    underscore: '_',
    jquery: '$',
  }
};