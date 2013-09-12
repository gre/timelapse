module.exports = function(grunt) {

    // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    exec: {
      glsl: {
        command: "node node_modules/glsl-unit/bin/template_glsl_compiler.js  --input src/game.glsl --variable_renaming INTERNAL | head -n 3 | tail -n 1 | perl -pi -e 's/\\\\n/\\n/g' | tee tmp/game.min.glsl" // OMG
      }
    },
    concat:{
      options: {
        separator: ''
      },
      dist: {
        src: ['src/glsl.min.js', 'src/main.js'],
        dest: 'tmp/<%= pkg.name %>.js'
      }
    },

    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
        mangle: {toplevel: true}
      },
      build: {
        src: ['tmp/<%= pkg.name %>.js'],
        dest: 'build/all.js'
      }
    },
    cssmin: {
      minify: {
        files: { 'build/style.css' : 'src/style.css' }
      }
    },

    watch: {
      assets : {
        files : ['src/*'],
        tasks : ['default']
      },
      html : {
        files   : ['build/index.html'],
        options : {
          livereload : true
        }
      }
    },
    assemble: {
      options: {
        partials : ['src/*', 'build/*.js', 'tmp/*'],
        helpers: 'node_modules/handlebars-helpers-examples/experimental/helpers/*.js'
      },
      files: {
        src   : ['src/index.hbs'],
        dest  : 'tmp/index.html'
      }
    },
    clean: {
      tmp: [
        'tmp/'
      ],
      build: [
        'build/'
      ],
      all: [
        'build.zip',
        'build/',
        'tmp/'
      ]
    },
    htmlmin: {                                     // Task
      dist: {                                      // Target
        options: {                                 // Target options
          removeComments: true,
          collapseWhitespace: true,
          removeOptionalTags : true
        },
        files: {                                   // Dictionary of files
          'build/index.html': 'tmp/index.html',     // 'destination': 'source'
        }
      }
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-htmlmin');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('assemble');

  // Default task(s).
  grunt.registerTask('default', ['clean', 'concat', 'uglify', 'exec:glsl', 'assemble', 'cssmin', 'htmlmin', 'clean:tmp']);
  grunt.registerTask('auto', ['default', 'watch']);
};
