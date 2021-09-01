const _ = require('lodash')
const gulp = require("gulp")
const gutil = require('gulp-util')
const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')

gulp.task('build', function(done) {
  const webpackConfig = require('./webpack.config.js');
  const compiler = webpack(webpackConfig);
  return compiler.run(done);
});

gulp.task('build_min', function(done) {
  let webpackConfig = require('./webpack.config.js');
  webpackConfig = _.cloneDeep(webpackConfig);
  webpackConfig.plugins = [
    // Minimize
    new webpack.optimize.UglifyJsPlugin({ sourceMap: false, compress: false, mangle: false })
  ];
  webpackConfig.output.filename = "minimongo.min.js";

  const compiler = webpack(webpackConfig);
  return compiler.run(done);
});

gulp.task('dist', gulp.series([
  'build',
  'build_min'
  ])
);

gulp.task("test", gulp.series([
  function() {
    const webpackConfig = require('./webpack.config.tests.js');
    const compiler = webpack(webpackConfig);

    return new WebpackDevServer(compiler, { }).listen(8081, "localhost", err => {
      if (err) { 
        throw new gutil.PluginError("webpack-dev-server", err);
      }

      // Server listening
      return gutil.log("[webpack-dev-server]", "http://localhost:8081/mocha.html");
    });
  }
])
);

