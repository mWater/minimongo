var gulp = require("gulp");
var coffee = require('gulp-coffee');
var gutil = require('gulp-util');

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

gulp.task('default', ['coffee', 'copy']);