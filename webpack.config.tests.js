module.exports = {
  entry: ['webpack-dev-server/client?http://localhost:8081', './test/index.js'],
  output: {
    filename: 'bundle.js',
    path: __dirname
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
  }
};
