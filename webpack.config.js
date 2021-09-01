path = require('path');

module.exports = {
  entry: ['./index.js'],
  devtool: "source-map",
  output: {
    filename: 'minimongo.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      { test: /\.(ts)$/, use: [
        { 
          loader: 'ts-loader',
          options: { transpileOnly: true }
        }
      ]}
    ]
  },
  resolve: {
    extensions: [".ts", ".js", ".json"]
  },
  externals: {
    lodash: '_',
    underscore: '_',
    jquery: '$',
  }
};