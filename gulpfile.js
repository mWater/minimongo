// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
import _ from 'lodash';
import gulp from "gulp";
import coffee from 'gulp-coffee';
import gutil from 'gulp-util';
import browserify from 'browserify';
import streamConvert from 'vinyl-source-stream';
import glob from 'glob';
import uglify from 'gulp-uglify';
import coffeeify from 'coffeeify';
import buffer from 'vinyl-buffer';
import rename from "gulp-rename";
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

// Compilation
gulp.task('coffee', () => gulp.src('./src/*.coffee')
  .pipe(coffee({ bare: true }).on('error', gutil.log))
  .pipe(gulp.dest('./lib/')));

gulp.task('copy', () => gulp.src(['./src/**/*.js'])
  .pipe(gulp.dest('./lib/')));

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
  'copy',
  'coffee',
  'build',
  'build_min'
  ])
);

//   , ->
//   bundler = browserify()
//   bundler.require("./jquery-shim.js", { expose: "jquery"})
//   bundler.require("./lodash-shim.js", { expose: "lodash"})
//   bundler.require("./index.js", { expose: "minimongo"})
//   return bundler.bundle()
//     .pipe(streamConvert('minimongo.js'))
//     .pipe(gulp.dest("./dist/"))
//     .pipe(buffer())
//     .pipe(rename("minimongo.min.js"))
//     .pipe(uglify())
//     .pipe(gulp.dest('./dist/'))
// )

gulp.task("test", gulp.series([
  "copy",
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

gulp.task('default', gulp.series(['coffee', 'copy', 'dist']));

