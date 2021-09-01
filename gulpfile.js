_ = require 'lodash'
gulp = require("gulp")
coffee = require('gulp-coffee')
gutil = require('gulp-util')
browserify = require('browserify')
streamConvert = require('vinyl-source-stream')
glob = require('glob')
uglify = require('gulp-uglify')
coffeeify = require('coffeeify')
buffer = require('vinyl-buffer')
rename = require("gulp-rename")

webpack = require 'webpack'
WebpackDevServer = require 'webpack-dev-server'

# Compilation
gulp.task 'coffee', ->
  return gulp.src('./src/*.coffee')
    .pipe(coffee({ bare: true }).on('error', gutil.log))
    .pipe(gulp.dest('./lib/'))

gulp.task 'copy', ->
  return gulp.src(['./src/**/*.js'])
    .pipe(gulp.dest('./lib/'))

gulp.task 'build', (done) ->
  webpackConfig = require './webpack.config.js'
  compiler = webpack(webpackConfig)
  compiler.run(done)

gulp.task 'build_min', (done) ->
  webpackConfig = require './webpack.config.js'
  webpackConfig = _.cloneDeep(webpackConfig)
  webpackConfig.plugins = [
    # Minimize
    new webpack.optimize.UglifyJsPlugin({ sourceMap: false, compress: false, mangle: false })
  ]
  webpackConfig.output.filename = "minimongo.min.js"

  compiler = webpack(webpackConfig)
  compiler.run(done)

gulp.task 'dist', gulp.series([
  'copy'
  'coffee'
  'build'
  'build_min'
  ])

#   , ->
#   bundler = browserify()
#   bundler.require("./jquery-shim.js", { expose: "jquery"})
#   bundler.require("./lodash-shim.js", { expose: "lodash"})
#   bundler.require("./index.js", { expose: "minimongo"})
#   return bundler.bundle()
#     .pipe(streamConvert('minimongo.js'))
#     .pipe(gulp.dest("./dist/"))
#     .pipe(buffer())
#     .pipe(rename("minimongo.min.js"))
#     .pipe(uglify())
#     .pipe(gulp.dest('./dist/'))
# )

gulp.task "test", gulp.series([
  "copy"
  ->
    webpackConfig = require './webpack.config.tests.js'
    compiler = webpack(webpackConfig)

    new WebpackDevServer(compiler, { }).listen 8081, "localhost", (err) =>
      if err 
        throw new gutil.PluginError("webpack-dev-server", err)

      # Server listening
      gutil.log("[webpack-dev-server]", "http://localhost:8081/mocha.html")
])

gulp.task('default', gulp.series(['coffee', 'copy', 'dist']))

