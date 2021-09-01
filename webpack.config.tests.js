module.exports = {
  entry: ['webpack-dev-server/client?http://localhost:8081', './test/index.js'],
  output: {
    filename: 'bundle.js',
    path: __dirname
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
  }
};
