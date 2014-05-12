var gulp = require("gulp");
var coffee = require('gulp-coffee');
var gutil = require('gulp-util');
var browserify = require('browserify');
var streamConvert = require('vinyl-source-stream');
var glob = require('glob');
var coffeeify = require('coffeeify');

// Compilation
gulp.task('coffee', function() {
	gulp.src('./src/*.coffee')
		.pipe(coffee({ bare: true }).on('error', gutil.log))
		.pipe(gulp.dest('./lib/'));
});

gulp.task('copy', function() {
	gulp.src(['./src/**/*.js'])
		.pipe(gulp.dest('./lib/'));
});

gulp.task('prepareTests', ['coffee', 'copy'], function() {
	var bundler = browserify({entries: glob.sync("./test/*Tests.coffee"), extensions: [".coffee"] }).
		transform(coffeeify);
	var stream = bundler.bundle()
		.pipe(streamConvert('browserified.js'))
		.pipe(gulp.dest('./test'));
	return stream;
});

gulp.task('default', ['coffee', 'copy']);