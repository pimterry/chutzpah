(function(){(function(context) {
var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    
    require.define = function (filename, fn) {
        if (require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return window.setImmediate;
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules/cucumber-html/src/main/resources/cucumber/formatter/formatter.js",function(require,module,exports,__dirname,__filename,process){var CucumberHTML = {};

CucumberHTML.DOMFormatter = function(rootNode) {
  var currentUri;
  var currentFeature;
  var currentElement;
  var currentSteps;

  var currentStepIndex;
  var currentStep;
  var $templates = $(CucumberHTML.templates);

  this.uri = function(uri) {
    currentUri = uri;
  };

  this.feature = function(feature) {
    currentFeature = blockElement(rootNode, feature, 'feature');
  };

  this.background = function(background) {
    currentElement = featureElement(background, 'background');
    currentStepIndex = 1;
  };

  this.scenario = function(scenario) {
    currentElement = featureElement(scenario, 'scenario');
    currentStepIndex = 1;
  };

  this.scenarioOutline = function(scenarioOutline) {
    currentElement = featureElement(scenarioOutline, 'scenario_outline');
    currentStepIndex = 1;
  };

  this.step = function(step) {
    var stepElement = $('.step', $templates).clone();
    stepElement.appendTo(currentSteps);
    populate(stepElement, step, 'step');

    if (step.doc_string) {
      docString = $('.doc_string', $templates).clone();
      docString.appendTo(stepElement);
      // TODO: use a syntax highlighter based on the content_type
      docString.text(step.doc_string.value);
    }
    if (step.rows) {
      dataTable = $('.data_table', $templates).clone();
      dataTable.appendTo(stepElement);
      var tBody = dataTable.find('tbody');
      $.each(step.rows, function(index, row) {
        var tr = $('<tr></tr>').appendTo(tBody);
        $.each(row.cells, function(index, cell) {
          var td = $('<td>' + cell + '</td>').appendTo(tBody);
        });
      });
    }
  };

  this.examples = function(examples) {
    var examplesElement = blockElement(currentElement.children('details'), examples, 'examples');
    var examplesTable = $('.examples_table', $templates).clone();
    examplesTable.appendTo(examplesElement.children('details'));

    $.each(examples.rows, function(index, row) {
      var parent = index == 0 ? examplesTable.find('thead') : examplesTable.find('tbody');
      var tr = $('<tr></tr>').appendTo(parent);
      $.each(row.cells, function(index, cell) {
        var td = $('<td>' + cell + '</td>').appendTo(tr);
      });
    });
  };

  this.match = function(match) {
    currentStep = currentSteps.find('li:nth-child(' + currentStepIndex + ')');
    currentStepIndex++;
  };

  this.result = function(result) {
    currentStep.addClass(result.status);
    currentElement.addClass(result.status);
    var isLastStep = currentSteps.find('li:nth-child(' + currentStepIndex + ')').length == 0;
    if(isLastStep) {
      if(currentSteps.find('.failed').length == 0) {
        // No failed steps. Collapse it.
        currentElement.find('details').removeAttr('open');
      }
    }
  };

  this.embedding = function(mimeType, data) {
    if(mimeType.match(/^image\//)) {
      currentStep.append("<div><img src='" + data + "'></div>");
    }
  }

  function featureElement(statement, itemtype) {
    var e = blockElement(currentFeature.children('details'), statement, itemtype);

    currentSteps = $('.steps', $templates).clone();
    currentSteps.appendTo(e.children('details'));

    return e;
  }

  function blockElement(parent, statement, itemtype) {
    var e = $('.blockelement', $templates).clone();
    e.appendTo(parent);
    return populate(e, statement, itemtype);
  }

  function populate(e, statement, itemtype) {
    populateTags(e, statement.tags);
    populateComments(e, statement.comments);
    e.find('.keyword').text(statement.keyword);
    e.find('.name').text(statement.name);
    e.find('.description').text(statement.description);
    e.attr('itemtype', 'http://cukes.info/microformat/' + itemtype);
    e.addClass(itemtype);
    return e;
  }

  function populateComments(e, comments) {
    if (comments !== undefined) {
      var commentsNode = $('.comments', $templates).clone().prependTo(e.find('.header'));
      $.each(comments, function(index, comment) {
        var commentNode = $('.comment', $templates).clone().appendTo(commentsNode);
        commentNode.text(comment.value);
      });
    }
  }

  function populateTags(e, tags) {
    if (tags !== undefined) {
      var tagsNode = $('.tags', $templates).clone().prependTo(e.find('.header'));
      $.each(tags, function(index, tag) {
        var tagNode = $('.tag', $templates).clone().appendTo(tagsNode);
        tagNode.text(tag.name);
      });
    }
  }
};

CucumberHTML.templates = '<div>\
  <section class="blockelement" itemscope>\
    <details open>\
      <summary class="header">\
        <span class="keyword" itemprop="keyword">Keyword</span>: <span itemprop="name" class="name">This is the block name</span>\
      </summary>\
      <div itemprop="description" class="description">The description goes here</div>\
    </details>\
  </section>\
\
  <ol class="steps"></ol>\
\
  <ol>\
    <li class="step"><span class="keyword" itemprop="keyword">Keyword</span><span class="name" itemprop="name">Name</span></li>\
  </ol>\
\
  <pre class="doc_string"></pre>\
\
  <table class="data_table">\
    <tbody>\
    </tbody>\
  </table>\
\
  <table class="examples_table">\
    <thead></thead>\
    <tbody></tbody>\
  </table>\
\
  <section class="embed">\
    <img itemprop="screenshot" class="screenshot" />\
  </section>\
  <div class="tags"></div>\
  <span class="tag"></span>\
  <div class="comments"></div>\
  <div class="comment"></div>\
<div>';

if (typeof module !== 'undefined') {
  module.exports = CucumberHTML;
}
});

require.define("/cucumber/ast",function(require,module,exports,__dirname,__filename,process){var Ast        = {};
Ast.Assembler  = require('./ast/assembler');
Ast.Background = require('./ast/background');
Ast.DataTable  = require('./ast/data_table');
Ast.DocString  = require('./ast/doc_string');
Ast.Feature    = require('./ast/feature');
Ast.Features   = require('./ast/features');
Ast.Filter     = require('./ast/filter');
Ast.Scenario   = require('./ast/scenario');
Ast.Step       = require('./ast/step');
Ast.Tag        = require('./ast/tag');
module.exports = Ast;

});

require.define("/cucumber/ast/assembler",function(require,module,exports,__dirname,__filename,process){var Assembler = function(features, filter) {
  var currentFeature, currentScenarioOrBackground, currentStep, suggestedFeature;
  var stashedTags = [];

  var self = {
    setCurrentFeature: function setCurrentFeature(feature) {
      currentFeature = feature;
      self.setCurrentScenarioOrBackground(undefined);
    },

    getCurrentFeature: function getCurrentFeature() {
      return currentFeature;
    },

    setCurrentScenarioOrBackground: function setCurrentScenarioOrBackground(scenarioOrBackground) {
      currentScenarioOrBackground = scenarioOrBackground;
      self.setCurrentStep(undefined);
    },

    getCurrentScenarioOrBackground: function getCurrentScenarioOrBackground() {
      return currentScenarioOrBackground;
    },

    setCurrentStep: function setCurrentStep(step) {
      currentStep = step;
    },

    getCurrentStep: function getCurrentStep() {
      return currentStep;
    },

    stashTag: function stashTag(tag) {
      stashedTags.push(tag);
    },

    revealTags: function revealTags() {
      var revealedTags = stashedTags;
      stashedTags      = [];
      return revealedTags;
    },

    applyCurrentFeatureTagsToElement: function applyCurrentFeatureTagsToElement(element) {
      var currentFeature = self.getCurrentFeature();
      var featureTags    = currentFeature.getTags();
      element.addTags(featureTags);
    },

    applyStashedTagsToElement: function applyStashedTagsToElement(element) {
      var revealedTags = self.revealTags();
      element.addTags(revealedTags);
    },

    insertBackground: function insertBackground(background) {
      self.setCurrentScenarioOrBackground(background);
      var currentFeature = self.getCurrentFeature();
      currentFeature.addBackground(background);
    },

    insertDataTableRow: function insertDataTableRow(dataTableRow) {
      var currentStep = self.getCurrentStep();
      currentStep.attachDataTableRow(dataTableRow);
    },

    insertDocString: function insertDocString(docString) {
      var currentStep = self.getCurrentStep();
      currentStep.attachDocString(docString);
    },

    insertFeature: function insertFeature(feature) {
      self.tryEnrollingSuggestedFeature();
      self.applyStashedTagsToElement(feature);
      self.setCurrentFeature(feature);
      self.suggestFeature(feature);
    },

    insertScenario: function insertScenario(scenario) {
      self.applyCurrentFeatureTagsToElement(scenario);
      self.applyStashedTagsToElement(scenario);
      self.setCurrentScenarioOrBackground(scenario);
      if (filter.isElementEnrolled(scenario)) {
        var currentFeature = self.getCurrentFeature();
        currentFeature.addScenario(scenario);
      }
    },

    insertStep: function insertStep(step) {
      self.setCurrentStep(step);
      var currentScenarioOrBackground = self.getCurrentScenarioOrBackground();
      currentScenarioOrBackground.addStep(step);
    },

    insertTag: function insertTag(tag) {
      self.stashTag(tag);
    },

    finish: function finish() {
      self.tryEnrollingSuggestedFeature();
    },

    suggestFeature: function suggestFeature(feature) {
      suggestedFeature = feature;
    },

    isSuggestedFeatureEnrollable: function isSuggestedFeatureEnrollable() {
      var enrollable = suggestedFeature && (suggestedFeature.hasScenarios() || filter.isElementEnrolled(suggestedFeature));
      return enrollable;
    },

    tryEnrollingSuggestedFeature: function tryEnrollingSuggestedFeature() {
      if (self.isSuggestedFeatureEnrollable())
        self.enrolSuggestedFeature();
    },

    enrolSuggestedFeature: function enrolSuggestedFeature() {
      features.addFeature(suggestedFeature);
      suggestedFeature = null;
    }
  };
  return self;
};

module.exports = Assembler;

});

require.define("/cucumber/ast/background",function(require,module,exports,__dirname,__filename,process){var Background = function(keyword, name, description, uri, line) {
  var Cucumber = require('../../cucumber');

  var steps = Cucumber.Type.Collection();

  var self = {
    getKeyword: function getKeyword() {
      return keyword;
    },

    getName: function getName() {
      return name;
    },

    getDescription: function getDescription() {
      return description;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    },

    addStep: function addStep(step) {
      var lastStep = self.getLastStep();
      step.setPreviousStep(lastStep);
      steps.add(step);
 	  },

    getLastStep: function getLastStep() {
      return steps.getLast();
    },

 	  getSteps: function getSteps() {
      return steps;
 	  }
  };
  return self;
};
module.exports = Background;

});

require.define("/cucumber",function(require,module,exports,__dirname,__filename,process){var Cucumber = function(featureSource, supportCodeInitializer, options) {
  var configuration = Cucumber.VolatileConfiguration(featureSource, supportCodeInitializer, options);
  var runtime       = Cucumber.Runtime(configuration);
  return runtime;
};
Cucumber.Ast                   = require('./cucumber/ast');
// browserify won't load ./cucumber/cli and throw an exception:
try { Cucumber.Cli             = require('./cucumber/cli'); } catch(e) {}
Cucumber.Debug                 = require('./cucumber/debug'); // Untested namespace
Cucumber.Listener              = require('./cucumber/listener');
Cucumber.Parser                = require('./cucumber/parser');
Cucumber.Runtime               = require('./cucumber/runtime');
Cucumber.SupportCode           = require('./cucumber/support_code');
Cucumber.TagGroupParser        = require('./cucumber/tag_group_parser');
Cucumber.Type                  = require('./cucumber/type');
Cucumber.Util                  = require('./cucumber/util');
Cucumber.VolatileConfiguration = require('./cucumber/volatile_configuration');

Cucumber.VERSION               = "0.3.0";

module.exports                 = Cucumber;

});

require.define("/cucumber/debug",function(require,module,exports,__dirname,__filename,process){var Debug = {
  TODO: function TODO(description) {
    return function() { throw(new Error("IMPLEMENT ME: " + description)); };
  },

  warn: function warn(string, caption, level) {
    if (Debug.isMessageLeveltoBeDisplayed(level))
      process.stdout.write(Debug.warningString(string, caption));
  },

  notice: function notice(string, caption, level) {
    if (Debug.isMessageLeveltoBeDisplayed(level))
      process.stdout.write(Debug.noticeString(string, caption));
  },

  warningString: function warningString(string, caption) {
    caption = caption || 'debug-warning';
    return "\033[30;43m" + caption + ":\033[0m \033[33m" + string + "\033[0m"
  },

  noticeString: function noticeString(string, caption) {
    caption = caption || 'debug-notice';
    return "\033[30;46m" + caption + ":\033[0m \033[36m" + string + "\033[0m"
  },

  prefix: function prefix() {
    return ;
  },

  isMessageLeveltoBeDisplayed: function isMessageLeveltoBeDisplayed(level) {
    if (process.env) {
      level = level || 3; // default level
      return (level <= process.env['DEBUG_LEVEL']);
    } else {
      return false;
    }
  }
};
Debug.SimpleAstListener = require('./debug/simple_ast_listener');
module.exports          = Debug;

});

require.define("/cucumber/debug/simple_ast_listener",function(require,module,exports,__dirname,__filename,process){var SimpleAstListener = function(options) {
  var logs                        = '';
  var failed                      = false;
  var beforeEachScenarioCallbacks = [];
  var currentStep;

  if (!options)
    var options = {};

  var self = {
    hear: function hear(event, callback) {
      switch(event.getName()) {
      case 'BeforeFeature':
        self.hearBeforeFeature(event.getPayloadItem('feature'), callback);
        break;
      case 'BeforeScenario':
        self.hearBeforeScenario(event.getPayloadItem('scenario'), callback);
        break;
      case 'BeforeStep':
        self.hearBeforeStep(event.getPayloadItem('step'), callback);
        break;
      case 'StepResult':
        self.hearStepResult(event.getPayloadItem('stepResult'), callback);
        break;
      default:
        callback();
      }
    },

    hearBeforeFeature: function hearBeforeFeature(feature, callback) {
      log("Feature: " + feature.getName());
      var description = feature.getDescription();
      if (description != "")
        log(description, 1);
      callback();
    },

    hearBeforeScenario: function hearBeforeScenario(scenario, callback) {
      beforeEachScenarioCallbacks.forEach(function(func) {
        func();
      });
      log("");
      log(scenario.getKeyword() + ": " + scenario.getName(), 1);
      callback();
    },

    hearBeforeStep: function hearBeforeStep(step, callback) {
      currentStep = step;
      callback();
    },

    hearStepResult: function hearStepResult(stepResult, callback) {
      log(currentStep.getKeyword() + currentStep.getName(), 2);
      if (currentStep.hasDocString()) {
        log('"""', 3);
        log(currentStep.getDocString().getContents(), 3);
        log('"""', 3);
      };
      callback();
    },

    getLogs: function getLogs() {
      return logs;
    },

    featuresPassed: function featuresPassed() {
      return !failed;
    },

    beforeEachScenarioDo: function beforeEachScenarioDo(func) {
      beforeEachScenarioCallbacks.push(func);
    }
  };
  return self;

  function log(message, indentation) {
    if (indentation)
      message = indent(message, indentation);
    logs = logs + message + "\n";
    if (options['logToConsole'])
      console.log(message);
    if (typeof(options['logToFunction']) == 'function')
      options['logToFunction'](message);
  };

  function indent(text, indentation) {
    var indented;
    text.split("\n").forEach(function(line) {
      var prefix = new Array(indentation + 1).join("  ");
      line = prefix + line;
      indented = (typeof(indented) == 'undefined' ? line : indented + "\n" + line);
    });
    return indented;
  };
};
module.exports = SimpleAstListener;

});

require.define("/cucumber/listener",function(require,module,exports,__dirname,__filename,process){var Listener = function () {
  var self = {
    hear: function hear(event, callback) {
      if (self.hasHandlerForEvent(event)) {
        var handler = self.getHandlerForEvent(event);
        handler(event, callback);
      } else {
        callback();
      }
    },

    hasHandlerForEvent: function hasHandlerForEvent(event) {
      var handlerName = self.buildHandlerNameForEvent(event);
      return self[handlerName] != undefined;
    },

    buildHandlerNameForEvent: function buildHandlerNameForEvent(event) {
      var handlerName =
        Listener.EVENT_HANDLER_NAME_PREFIX +
        event.getName() +
        Listener.EVENT_HANDLER_NAME_SUFFIX;
      return handlerName;
    },

    getHandlerForEvent: function getHandlerForEvent(event) {
      var eventHandlerName = self.buildHandlerNameForEvent(event);
      return self[eventHandlerName];
    }
  };
  return self;
};

Listener.EVENT_HANDLER_NAME_PREFIX = 'handle';
Listener.EVENT_HANDLER_NAME_SUFFIX = 'Event';

Listener.Formatter         = require('./listener/formatter');
Listener.PrettyFormatter   = require('./listener/pretty_formatter');
Listener.ProgressFormatter = require('./listener/progress_formatter');
Listener.JsonFormatter     = require('./listener/json_formatter');
Listener.StatsJournal      = require('./listener/stats_journal');
Listener.SummaryFormatter  = require('./listener/summary_formatter');
module.exports             = Listener;

});

require.define("/cucumber/listener/formatter",function(require,module,exports,__dirname,__filename,process){var Formatter = function (options) {
  var Cucumber = require('../../cucumber');

  if (!options)
    options = {};
  if (options['logToConsole'] == undefined)
    options['logToConsole'] = true;

  var logs = "";

  var self = Cucumber.Listener();

  self.log = function log(string) {
    logs += string;
    if (options['logToConsole'])
      process.stdout.write(string);
    if (typeof(options['logToFunction']) == 'function')
      options['logToFunction'](string);
  };

  self.getLogs = function getLogs() {
    return logs;
  };

  return self;
};
module.exports = Formatter;

});

require.define("/cucumber/listener/pretty_formatter",function(require,module,exports,__dirname,__filename,process){var PrettyFormatter = function(options) {
  var Cucumber = require('../../cucumber');

  var self             = Cucumber.Listener.Formatter(options);
  var summaryFormatter = Cucumber.Listener.SummaryFormatter({logToConsole: false});

  var parentHear = self.hear;
  self.hear = function hear(event, callback) {
    summaryFormatter.hear(event, function () {
      parentHear(event, callback);
    });
  };

  self.handleBeforeFeatureEvent = function handleBeforeFeatureEvent(event, callback) {
    var feature = event.getPayloadItem('feature');
    var source = feature.getKeyword() + ": " + feature.getName() + "\n\n";
    self.log(source);
    callback();
  };

  self.handleBeforeScenarioEvent = function handleBeforeScenarioEvent(event, callback) {
    var scenario = event.getPayloadItem('scenario');
    var source = scenario.getKeyword() + ": " + scenario.getName() + "\n";
    self.logIndented(source, 1);
    callback();
  };

  self.handleAfterScenarioEvent = function handleAfterScenarioEvent(event, callback) {
    self.log("\n");
    callback();
  };

  self.handleStepResultEvent = function handleStepResultEvent(event, callback) {
    var stepResult = event.getPayloadItem('stepResult');
    var step = stepResult.getStep();
    var source = step.getKeyword() + step.getName() + "\n";
    self.logIndented(source, 2);

    if (step.hasDataTable()) {
      var dataTable = step.getDataTable();
      self.logDataTable(dataTable);
    }

    if (step.hasDocString()) {
      var docString = step.getDocString();
      self.logDocString(docString);
    }

    stepResult.isFailed();
    if (stepResult.isFailed()) {
      var failure            = stepResult.getFailureException();
      var failureDescription = failure.stack || failure;
      self.logIndented(failureDescription + "\n", 3);
    }
    callback();
  };

  self.handleAfterFeaturesEvent = function handleAfterFeaturesEvent(event, callback) {
    var summaryLogs = summaryFormatter.getLogs();
    self.log("\n");
    self.log(summaryLogs);
    callback();
  };

  self.logDataTable = function logDataTable(dataTable) {
    var rows         = dataTable.raw();
    var columnWidths = self._determineColumnWidthsFromRows(rows);
    var rowCount     = rows.length;
    var columnCount  = columnWidths.length;

    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      var cells = rows[rowIndex];
      var line = "|";
      for (var columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        var cell        = cells[columnIndex];
        var columnWidth = columnWidths[columnIndex];
        line += " " + self._pad(cell, columnWidth) + " |"
      }
      line += "\n";
      self.logIndented(line, 3);
    }
  };

  self.logDocString = function logDocString(docString) {
    var contents = docString.getContents();
    self.logIndented('"""\n' + contents + '\n"""\n' , 3);
  };

  self.logIndented = function logIndented(text, level) {
    var indented = self.indent(text, level);
    self.log(indented);
  };

  self.indent = function indent(text, level) {
    var indented;
    text.split("\n").forEach(function(line) {
      var prefix = new Array(level + 1).join("  ");
      line = (prefix + line).replace(/\s+$/, '');
      indented = (typeof(indented) == 'undefined' ? line : indented + "\n" + line);
    });
    return indented;
  };

  self._determineColumnWidthsFromRows = function _determineColumnWidthsFromRows(rows) {
    var columnWidths = [];
    var currentColumn;

    rows.forEach(function (cells) {
      currentColumn = 0;
      cells.forEach(function (cell) {
        var currentColumnWidth = columnWidths[currentColumn];
        var currentCellWidth   = cell.length;
        if (typeof currentColumnWidth == "undefined" || currentColumnWidth < currentCellWidth)
          columnWidths[currentColumn] = currentCellWidth;
        currentColumn += 1;
      });
    });

    return columnWidths;
  };

  self._pad = function _pad(text, width) {
    var padded = "" + text;
    while (padded.length < width) {
      padded += " ";
    }
    return padded;
  };

  return self;
};
module.exports = PrettyFormatter;

});

require.define("/cucumber/listener/progress_formatter",function(require,module,exports,__dirname,__filename,process){var ProgressFormatter = function(options) {
  var Cucumber = require('../../cucumber');

  if (!options)
    options = {};

  var self             = Cucumber.Listener.Formatter(options);
  var summaryFormatter = Cucumber.Listener.SummaryFormatter({logToConsole: false});

  var parentHear = self.hear;
  self.hear = function hear(event, callback) {
    summaryFormatter.hear(event, function () {
      parentHear(event, callback);
    });
  };

  self.handleStepResultEvent = function handleStepResult(event, callback) {
    var stepResult = event.getPayloadItem('stepResult');
    if (stepResult.isSuccessful())
      self.handleSuccessfulStepResult();
    else if (stepResult.isPending())
      self.handlePendingStepResult();
    else if (stepResult.isSkipped())
      self.handleSkippedStepResult();
    else if (stepResult.isUndefined())
      self.handleUndefinedStepResult();
    else
      self.handleFailedStepResult();
    callback();
  };

  self.handleSuccessfulStepResult = function handleSuccessfulStepResult() {
    self.log(ProgressFormatter.PASSED_STEP_CHARACTER);
  };

  self.handlePendingStepResult = function handlePendingStepResult() {
    self.log(ProgressFormatter.PENDING_STEP_CHARACTER);
  };

  self.handleSkippedStepResult = function handleSkippedStepResult() {
    self.log(ProgressFormatter.SKIPPED_STEP_CHARACTER);
  };

  self.handleUndefinedStepResult = function handleUndefinedStepResult() {
    self.log(ProgressFormatter.UNDEFINED_STEP_CHARACTER);
  };

  self.handleFailedStepResult = function handleFailedStepResult() {
    self.log(ProgressFormatter.FAILED_STEP_CHARACTER);
  };

  self.handleAfterFeaturesEvent = function handleAfterFeaturesEvent(event, callback) {
    var summaryLogs = summaryFormatter.getLogs();
    self.log("\n\n");
    self.log(summaryLogs);
    callback();
  };

  return self;
};
ProgressFormatter.PASSED_STEP_CHARACTER    = '.';
ProgressFormatter.SKIPPED_STEP_CHARACTER   = '-';
ProgressFormatter.UNDEFINED_STEP_CHARACTER = 'U';
ProgressFormatter.PENDING_STEP_CHARACTER   = 'P';
ProgressFormatter.FAILED_STEP_CHARACTER    = 'F';
module.exports                             = ProgressFormatter;

});

require.define("/cucumber/listener/json_formatter",function(require,module,exports,__dirname,__filename,process){var JsonFormatter = function() {
  var Cucumber             = require('../../cucumber');
  var GherkinJsonFormatter = require('gherkin/lib/gherkin/formatter/json_formatter');
  var gherkinJsonFormatter =  new GherkinJsonFormatter(process.stdout);

  var currentFeatureId     = 'undefined';
  var self                 = Cucumber.Listener();
  var parentFeatureTags;

  self.getGherkinFormatter = function() {
    return gherkinJsonFormatter;
  }

  self.formatStep = function formatStep(step) {
    var stepProperties = {
      name:    step.getName(),
      line:    step.getLine(),
      keyword: step.getKeyword()
    };
    if (step.hasDocString()) {
      var docString = step.getDocString();
      stepProperties['doc_string'] = {
        value:        docString.getContents(),
        line:         docString.getLine(),
        content_type: docString.getContentType()
      };
    }
    if (step.hasDataTable()) {
      var tableContents   = step.getDataTable().getContents();
      var raw             = tableContents.raw();
      var tableProperties = [];
      raw.forEach(function (rawRow) {
        var row = {line: undefined, cells: rawRow};
        tableProperties.push(row);
      });
      stepProperties['rows'] = tableProperties;
    }
    gherkinJsonFormatter.step(stepProperties);
  }

  self.formatTags = function formatTags(tags, parentTags) {
    var tagsProperties = [];
    tags.forEach(function (tag) {
      var isParentTag = false;
      if (parentTags) {
        parentTags.forEach(function (parentTag) {
          if ((tag.getName() == parentTag.getName()) && (tag.getLine() == parentTag.getLine())) {
            isParentTag = true;
          }
        });
      }
      if (!isParentTag) {
        tagsProperties.push({name: tag.getName(), line: tag.getLine()});
      }
    });
    return tagsProperties;
  }

  self.handleBeforeFeatureEvent = function handleBeforeFeatureEvent(event, callback) {
    var feature      = event.getPayloadItem('feature');
    currentFeatureId = feature.getName().replace(' ', '-'); // FIXME: wrong abstraction level, this should be encapsulated "somewhere"

    var featureProperties = {
      id:          currentFeatureId,
      name:        feature.getName(),
      description: feature.getDescription(),
      line:        feature.getLine(),
      keyword:     feature.getKeyword()
    };

    var tags = feature.getTags();
    if (tags.length > 0) {
      formattedTags = self.formatTags(tags, []);
      featureProperties['tags'] = formattedTags;
    }

    gherkinJsonFormatter.uri(feature.getUri());
    gherkinJsonFormatter.feature(featureProperties);
    parentFeatureTags = tags;
    callback();
  }

  self.handleBackgroundEvent = function handleBackgroundEvent(event, callback) {
    var background = event.getPayloadItem('background');
    gherkinJsonFormatter.background({name: background.getName(), keyword: "Background", description: background.getDescription(), type: 'background', line: background.getLine()})
    var steps = background.getSteps();
    steps.forEach(function(value, index, ar) { self.formatStep(value); });
    callback();
  }

  self.handleBeforeScenarioEvent = function handleBeforeScenarioEvent(event, callback) {

    var scenario = event.getPayloadItem('scenario');

    var id = currentFeatureId + ';' + scenario.getName().replace(/ /g, '-').toLowerCase();
    var scenarioProperties = {name: scenario.getName(), id: id, line: scenario.getLine(), keyword: 'Scenario',  description: scenario.getDescription(), type: 'scenario'};

    var tags = scenario.getTags();
    if (tags.length > 0) {
      var formattedTags = self.formatTags(tags, parentFeatureTags);
      if (formattedTags.length > 0) {
        scenarioProperties['tags'] = formattedTags;
      }
    }
    gherkinJsonFormatter.scenario(scenarioProperties);
    callback();
  }

  self.handleStepResultEvent = function handleStepResult(event, callback) {
    var stepResult = event.getPayloadItem('stepResult');

    var step = stepResult.getStep();
    self.formatStep(step);

    var stepOutput = {};
    var resultStatus = 'failed';

    if (stepResult.isSuccessful()) {
      resultStatus = 'passed';
    }
    else if (stepResult.isPending()) {
      resultStatus = 'pending';
      stepOutput['error_message'] = undefined;
    }
    else if (stepResult.isSkipped()) {
      resultStatus = 'skipped';
    }
    else if (stepResult.isUndefined()) {
      resultStatus = 'undefined';
    }
    else {
      var failureMessage = stepResult.getFailureException();
      if (failureMessage) {
        stepOutput['error_message'] = (failureMessage.stack || failureMessage);
      }
    }

    stepOutput['status'] = resultStatus;
    gherkinJsonFormatter.result(stepOutput);
    gherkinJsonFormatter.match({location: undefined});
    callback();
  }

  self.handleAfterFeaturesEvent = function handleAfterFeaturesEvent(event, callback) {
    gherkinJsonFormatter.eof();
    gherkinJsonFormatter.done();
    callback();
  }

  return self;
};

module.exports = JsonFormatter;


});

require.define("/node_modules/gherkin/lib/gherkin/formatter/json_formatter.js",function(require,module,exports,__dirname,__filename,process){// This is a straight port of json_formatter.rb
var JSONFormatter = function(io) {
    var feature_hashes = [];
	var uri, feature_hash, current_step_or_hook;

    this.done = function() {
        io.write(JSON.stringify(feature_hashes));
    };

    this.uri = function(_uri) {
        uri = _uri;
    };
    
    this.feature = function(feature) {
        feature_hash = feature;
        feature_hash['uri'] = uri;
        feature_hashes.push(feature_hash);
    };

    this.background = function(background) {
        feature_elements().push(background);
    };
    
    this.scenario = function(scenario) {
        feature_elements().push(scenario);
    };

    this.scenario_outline = function(scenario_outline) {
        feature_elements().push(scenario_outline);
    };

    this.examples = function(examples) {
        all_examples().push(examples);
    };

    this.step = function(step) {
	    current_step_or_hook = step;
	    steps().push(current_step_or_hook);
    }
    
    this.match = function(match) {
	    current_step_or_hook['match'] = match;
    }

    this.result = function(result) {
		current_step_or_hook['result'] = result;
    }

    this.before = function(match, result) {
        add_hook(match, result, "before");
    }

    this.after = function(match, result) {
        add_hook(match, result, "after");
    }

    this.embedding = function(mime_type, data) {
	    embeddings().push({'mime_type': mime_type, 'data': encode64s(data)})
    }

    this.write = function(text) {
        output().push(text);
    };

    this.eof = function() {};
    
    // "private" methods

    function add_hook(match, result, hook) {
        if(!feature_element()[hook]) {
            feature_element()[hook] = [];
        }
        var hooks = feature_element()[hook];
        hooks.push({'match': match, 'result': result});
    }

    function feature_elements() {
        if(!feature_hash['elements']) {
            feature_hash['elements'] = [];
        }
        return feature_hash['elements'];
    }

    function feature_element() {
        return feature_elements()[feature_elements().length - 1];
    }

    function all_examples() {
        if(!feature_element()['examples']) {
            feature_element()['examples'] = [];
        }
        return feature_element()['examples'];
    }

    function steps() {
        if(!feature_element()['steps']) {
            feature_element()['steps'] = [];
        }
        return feature_element()['steps'];
    }

    function embeddings() {
        if(!current_step_or_hook['embeddings']) {
            current_step_or_hook['embeddings'] = [];
        }
        return current_step_or_hook['embeddings'];
    }

    function output() {
        if(!current_step_or_hook['output']) {
            current_step_or_hook['output'] = [];
        }
        return current_step_or_hook['output'];
    }
    
    // http://gitorious.org/javascript-base64/javascript-base64/blobs/master/base64.js
    function encode64s(input) {
        var swaps = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","0","1","2","3","4","5","6","7","8","9","+","/"];
        var input_binary = "";
        var output = "";
        var temp_binary;
        var index;
        for (index=0; index < input.length; index++) {
            temp_binary = input.charCodeAt(index).toString(2);
            while (temp_binary.length < 8) {
                temp_binary = "0"+temp_binary;
            }
            input_binary = input_binary + temp_binary;
            while (input_binary.length >= 6) {
                output = output + swaps[parseInt(input_binary.substring(0,6),2)];
                input_binary = input_binary.substring(6);
            }
        }
        if (input_binary.length == 4) {
            temp_binary = input_binary + "00";
            output = output + swaps[parseInt(temp_binary,2)];
            output = output + "=";
        }
        if (input_binary.length == 2) {
            temp_binary = input_binary + "0000";
            output = output + swaps[parseInt(temp_binary,2)];
            output = output + "==";
        }
        return output;
    }
}

module.exports = JSONFormatter;

});

require.define("/cucumber/listener/stats_journal",function(require,module,exports,__dirname,__filename,process){var StatsJournal = function(options) {
  var Cucumber = require('../../cucumber');

  var passedScenarioCount      = 0;
  var undefinedScenarioCount   = 0;
  var pendingScenarioCount     = 0;
  var failedScenarioCount      = 0;
  var passedStepCount          = 0;
  var failedStepCount          = 0;
  var skippedStepCount         = 0;
  var undefinedStepCount       = 0;
  var pendingStepCount         = 0;
  var currentScenarioFailing   = false;
  var currentScenarioUndefined = false;
  var currentScenarioPending   = false;

  if (!options)
    options = {};

  var self = Cucumber.Listener();

  self.handleBeforeScenarioEvent = function handleBeforeScenarioEvent(event, callback) {
    self.prepareBeforeScenario();
    callback();
  };

  self.handleStepResultEvent = function handleStepResult(event, callback) {
    var stepResult = event.getPayloadItem('stepResult');
    if (stepResult.isSuccessful())
      self.handleSuccessfulStepResult();
    else if (stepResult.isPending())
      self.handlePendingStepResult();
    else if (stepResult.isSkipped())
      self.handleSkippedStepResult();
    else if (stepResult.isUndefined())
      self.handleUndefinedStepResult(stepResult);
    else
      self.handleFailedStepResult(stepResult);
    callback();
  };

  self.handleSuccessfulStepResult = function handleSuccessfulStepResult() {
    self.witnessPassedStep();
  };

  self.handlePendingStepResult = function handlePendingStepResult() {
    self.witnessPendingStep();
    self.markCurrentScenarioAsPending();
  };

  self.handleSkippedStepResult = function handleSkippedStepResult() {
    self.witnessSkippedStep();
  };

  self.handleUndefinedStepResult = function handleUndefinedStepResult(stepResult) {
    var step = stepResult.getStep();
    self.witnessUndefinedStep();
    self.markCurrentScenarioAsUndefined();
  };

  self.handleFailedStepResult = function handleFailedStepResult(stepResult) {
    self.witnessFailedStep();
    self.markCurrentScenarioAsFailing();
  };

  self.handleAfterScenarioEvent = function handleAfterScenarioEvent(event, callback) {
    if (self.isCurrentScenarioFailing()) {
      var scenario = event.getPayloadItem('scenario');
      self.witnessFailedScenario();
    } else if (self.isCurrentScenarioUndefined()) {
      self.witnessUndefinedScenario();
    } else if (self.isCurrentScenarioPending()) {
      self.witnessPendingScenario();
    } else {
      self.witnessPassedScenario();
    }
    callback();
  };

  self.prepareBeforeScenario = function prepareBeforeScenario() {
    currentScenarioFailing   = false;
    currentScenarioPending   = false;
    currentScenarioUndefined = false;
  };

  self.markCurrentScenarioAsFailing = function markCurrentScenarioAsFailing() {
    currentScenarioFailing = true;
  };

  self.markCurrentScenarioAsUndefined = function markCurrentScenarioAsUndefined() {
    currentScenarioUndefined = true;
  };

  self.markCurrentScenarioAsPending = function markCurrentScenarioAsPending() {
    currentScenarioPending = true;
  };

  self.isCurrentScenarioFailing = function isCurrentScenarioFailing() {
    return currentScenarioFailing;
  };

  self.isCurrentScenarioUndefined = function isCurrentScenarioUndefined() {
    return currentScenarioUndefined;
  };

  self.isCurrentScenarioPending = function isCurrentScenarioPending() {
    return currentScenarioPending;
  };

  self.witnessPassedScenario = function witnessPassedScenario() {
    passedScenarioCount++;
  };

  self.witnessUndefinedScenario = function witnessUndefinedScenario() {
    undefinedScenarioCount++;
  };

  self.witnessPendingScenario = function witnessPendingScenario() {
    pendingScenarioCount++;
  };

  self.witnessFailedScenario = function witnessFailedScenario() {
    failedScenarioCount++;
  };

  self.witnessPassedStep = function witnessPassedStep() {
    passedStepCount++;
  };

  self.witnessUndefinedStep = function witnessUndefinedStep() {
    undefinedStepCount++;
  };

  self.witnessPendingStep = function witnessPendingStep() {
    pendingStepCount++;
  };

  self.witnessFailedStep = function witnessFailedStep() {
    failedStepCount++;
  };

  self.witnessSkippedStep = function witnessSkippedStep() {
    skippedStepCount++;
  };

  self.getScenarioCount = function getScenarioCount() {
    var scenarioCount =
      self.getPassedScenarioCount()    +
      self.getUndefinedScenarioCount() +
      self.getPendingScenarioCount()   +
      self.getFailedScenarioCount();
    return scenarioCount;
  };

  self.getPassedScenarioCount = function getPassedScenarioCount() {
    return passedScenarioCount;
  };

  self.getUndefinedScenarioCount = function getUndefinedScenarioCount() {
    return undefinedScenarioCount;
  };

  self.getPendingScenarioCount = function getPendingScenarioCount() {
    return pendingScenarioCount;
  };

  self.getFailedScenarioCount = function getFailedScenarioCount() {
    return failedScenarioCount;
  };

  self.getStepCount = function getStepCount() {
    var stepCount =
      self.getPassedStepCount()    +
      self.getUndefinedStepCount() +
      self.getSkippedStepCount()   +
      self.getPendingStepCount()   +
      self.getFailedStepCount();
    return stepCount;
  };

  self.getPassedStepCount = function getPassedStepCount() {
    return passedStepCount;
  };

  self.getPendingStepCount = function getPendingStepCount() {
    return pendingStepCount;
  };

  self.getFailedStepCount = function getFailedStepCount() {
    return failedStepCount;
  };

  self.getSkippedStepCount = function getSkippedStepCount() {
    return skippedStepCount;
  };

  self.getUndefinedStepCount = function getUndefinedStepCount() {
    return undefinedStepCount;
  };

  self.witnessedAnyFailedStep = function witnessedAnyFailedStep() {
    return failedStepCount > 0;
  };

  self.witnessedAnyUndefinedStep = function witnessedAnyUndefinedStep() {
    return undefinedStepCount > 0;
  };

  return self;
};
StatsJournal.EVENT_HANDLER_NAME_PREFIX = 'handle';
StatsJournal.EVENT_HANDLER_NAME_SUFFIX = 'Event';
module.exports = StatsJournal;

});

require.define("/cucumber/listener/summary_formatter",function(require,module,exports,__dirname,__filename,process){var SummaryFormatter = function (options) {
  var Cucumber = require('../../cucumber');

  var failedScenarioLogBuffer = "";
  var undefinedStepLogBuffer  = "";
  var failedStepResults       = Cucumber.Type.Collection();
  var statsJournal            = Cucumber.Listener.StatsJournal();

  var self = Cucumber.Listener.Formatter(options);

  var parentHear = self.hear;
  self.hear = function hear(event, callback) {
    statsJournal.hear(event, function () {
      parentHear(event, callback);
    });
  };

  self.handleStepResultEvent = function handleStepResult(event, callback) {
    var stepResult = event.getPayloadItem('stepResult');
    if (stepResult.isUndefined()) {
      self.handleUndefinedStepResult(stepResult);
    } else if (stepResult.isFailed()) {
      self.handleFailedStepResult(stepResult);
    }
    callback();
  };

  self.handleUndefinedStepResult = function handleUndefinedStepResult(stepResult) {
    var step = stepResult.getStep();
    self.storeUndefinedStep(step);
  };

  self.handleFailedStepResult = function handleFailedStepResult(stepResult) {
    self.storeFailedStepResult(stepResult);
  };

  self.handleAfterScenarioEvent = function handleAfterScenarioEvent(event, callback) {
    if (statsJournal.isCurrentScenarioFailing()) {
      var scenario = event.getPayloadItem('scenario');
      self.storeFailedScenario(scenario);
    }
    callback();
  };

  self.handleAfterFeaturesEvent = function handleAfterFeaturesEvent(event, callback) {
    self.logSummary();
    callback();
  };

  self.storeFailedStepResult = function storeFailedStepResult(failedStepResult) {
    failedStepResults.add(failedStepResult);
  };

  self.storeFailedScenario = function storeFailedScenario(failedScenario) {
    var name = failedScenario.getName();
    var uri  = failedScenario.getUri();
    var line = failedScenario.getLine();
    self.appendStringToFailedScenarioLogBuffer(uri + ":" + line + " # Scenario: " + name);
  };

  self.storeUndefinedStep = function storeUndefinedStep(step) {
    var snippetBuilder = Cucumber.SupportCode.StepDefinitionSnippetBuilder(step);
    var snippet        = snippetBuilder.buildSnippet();
    self.appendStringToUndefinedStepLogBuffer(snippet);
  };

  self.appendStringToFailedScenarioLogBuffer = function appendStringToFailedScenarioLogBuffer(string) {
    failedScenarioLogBuffer += string + "\n";
  };

  self.appendStringToUndefinedStepLogBuffer = function appendStringToUndefinedStepLogBuffer(string) {
    if (undefinedStepLogBuffer.indexOf(string) == -1)
      undefinedStepLogBuffer += string + "\n";
  };

  self.getFailedScenarioLogBuffer = function getFailedScenarioLogBuffer() {
    return failedScenarioLogBuffer;
  };

  self.getUndefinedStepLogBuffer = function getUndefinedStepLogBuffer() {
    return undefinedStepLogBuffer;
  };

  self.logSummary = function logSummary() {
    if (statsJournal.witnessedAnyFailedStep())
      self.logFailedStepResults();
    self.logScenariosSummary();
    self.logStepsSummary();
    if (statsJournal.witnessedAnyUndefinedStep())
      self.logUndefinedStepSnippets();
  };

  self.logFailedStepResults = function logFailedStepResults() {
    self.log("(::) failed steps (::)\n\n");
    failedStepResults.syncForEach(function(stepResult) {
      self.logFailedStepResult(stepResult);
    });
    self.log("Failing scenarios:\n");
    var failedScenarios = self.getFailedScenarioLogBuffer();
    self.log(failedScenarios);
    self.log("\n");
  };

  self.logFailedStepResult = function logFailedStepResult(stepResult) {
    var failureMessage = stepResult.getFailureException();
    self.log(failureMessage.stack || failureMessage);
    self.log("\n\n");
  };

  self.logScenariosSummary = function logScenariosSummary() {
    var scenarioCount          = statsJournal.getScenarioCount();
    var passedScenarioCount    = statsJournal.getPassedScenarioCount();
    var undefinedScenarioCount = statsJournal.getUndefinedScenarioCount();
    var pendingScenarioCount   = statsJournal.getPendingScenarioCount();
    var failedScenarioCount    = statsJournal.getFailedScenarioCount();
    var details                = [];

    self.log(scenarioCount + " scenario" + (scenarioCount != 1 ? "s" : ""));
    if (scenarioCount > 0 ) {
      if (failedScenarioCount > 0)
        details.push(failedScenarioCount + " failed");
      if (undefinedScenarioCount > 0)
        details.push(undefinedScenarioCount + " undefined");
      if (pendingScenarioCount > 0)
        details.push(pendingScenarioCount + " pending");
      if (passedScenarioCount > 0)
        details.push(passedScenarioCount + " passed");
      self.log(" (" + details.join(', ') + ")");
    }
    self.log("\n");
  };

  self.logStepsSummary = function logStepsSummary() {
    var stepCount          = statsJournal.getStepCount();
    var passedStepCount    = statsJournal.getPassedStepCount();
    var undefinedStepCount = statsJournal.getUndefinedStepCount();
    var skippedStepCount   = statsJournal.getSkippedStepCount();
    var pendingStepCount   = statsJournal.getPendingStepCount();
    var failedStepCount    = statsJournal.getFailedStepCount();
    var details            = [];

    self.log(stepCount + " step" + (stepCount != 1 ? "s" : ""));
    if (stepCount > 0) {
      if (failedStepCount > 0)
        details.push(failedStepCount    + " failed");
      if (undefinedStepCount > 0)
        details.push(undefinedStepCount + " undefined");
      if (pendingStepCount > 0)
        details.push(pendingStepCount   + " pending");
      if (skippedStepCount > 0)
        details.push(skippedStepCount   + " skipped");
      if (passedStepCount > 0)
        details.push(passedStepCount    + " passed");
      self.log(" (" + details.join(', ') + ")");
    }
    self.log("\n");
  };

  self.logUndefinedStepSnippets = function logUndefinedStepSnippets() {
    var undefinedStepLogBuffer = self.getUndefinedStepLogBuffer();
    self.log("\nYou can implement step definitions for undefined steps with these snippets:\n\n");
    self.log(undefinedStepLogBuffer);
  };

  return self;
};
module.exports = SummaryFormatter;

});

require.define("/cucumber/parser",function(require,module,exports,__dirname,__filename,process){var Parser = function(featureSources, astFilter) {
  var Gherkin      = require('gherkin');
  var GherkinLexer = require('gherkin/lib/gherkin/lexer/en');
  var Cucumber     = require('../cucumber');

  var features     = Cucumber.Ast.Features();
  var astAssembler = Cucumber.Ast.Assembler(features, astFilter);
  var currentSourceUri;

  var self = {
    parse: function parse() {
      var eventHandler = self.getEventHandlers();
      var lexer = new GherkinLexer(self.getEventHandlers());
      for (i in featureSources) {
        var currentSourceUri = featureSources[i][Parser.FEATURE_NAME_SOURCE_PAIR_URI_INDEX];
        var featureSource    = featureSources[i][Parser.FEATURE_NAME_SOURCE_PAIR_SOURCE_INDEX];
        self.setCurrentSourceUri(currentSourceUri);
        lexer.scan(featureSource);
      }
      return features;
    },

    setCurrentSourceUri: function setCurrentSourceUri(uri) {
      currentSourceUri = uri;
    },

    getCurrentSourceUri: function getCurrentSourceUri() {
      return currentSourceUri;
    },

    getEventHandlers: function getEventHandlers() {
      return {
        background:       self.handleBackground,
        comment:          self.handleComment,
        doc_string:       self.handleDocString,
        eof:              self.handleEof,
        feature:          self.handleFeature,
        row:              self.handleDataTableRow,
        scenario:         self.handleScenario,
        step:             self.handleStep,
        tag:              self.handleTag,
        scenario_outline: self.handleScenarioOutline,
        examples:         self.handleExamples
      };
    },

    handleBackground: function handleBackground(keyword, name, description, line) {
      var uri        = self.getCurrentSourceUri();
      var background = Cucumber.Ast.Background(keyword, name, description, uri, line);
      astAssembler.insertBackground(background);
    },

    handleComment: function handleComment() {},

    handleDocString: function handleDocString(contentType, string, line) {
      var uri       = self.getCurrentSourceUri();
      var docString = Cucumber.Ast.DocString(contentType, string, uri, line);
      astAssembler.insertDocString(docString);
    },

    handleEof: function handleEof() {
      astAssembler.finish();
    },

    handleFeature: function handleFeature(keyword, name, description, line) {
      var uri     = self.getCurrentSourceUri();
      var feature = Cucumber.Ast.Feature(keyword, name, description, uri, line);
      astAssembler.insertFeature(feature);
    },

    handleDataTableRow: function handleDataTableRow(cells, line) {
      var uri          = self.getCurrentSourceUri();
      var dataTableRow = Cucumber.Ast.DataTable.Row(cells, uri, line);
      astAssembler.insertDataTableRow(dataTableRow);
    },

    handleScenario: function handleScenario(keyword, name, description, line) {
      var uri      = self.getCurrentSourceUri();
      var scenario = Cucumber.Ast.Scenario(keyword, name, description, uri, line);
      astAssembler.insertScenario(scenario);
    },

    handleStep: function handleStep(keyword, name, line) {
      var uri  = self.getCurrentSourceUri();
      var step = Cucumber.Ast.Step(keyword, name, uri, line);
      astAssembler.insertStep(step);
    },

    handleTag: function handleTag(tag, line) {
      var uri = self.getCurrentSourceUri();
      var tag = Cucumber.Ast.Tag(tag, uri, line);
      astAssembler.insertTag(tag);
    },

    handleScenarioOutline: function handleScenarioOutline(keyword, name, description, line) {
      throw new Error("Scenario outlines are not supported yet. See https://github.com/cucumber/cucumber-js/issues/10");
    },

    handleExamples: function handleExamples(keyword, name, description, line) {
      throw new Error("Examples are not supported yet. See https://github.com/cucumber/cucumber-js/issues/10");
    }
  };
  return self;
};
Parser.FEATURE_NAME_SOURCE_PAIR_URI_INDEX = 0;
Parser.FEATURE_NAME_SOURCE_PAIR_SOURCE_INDEX = 1;
module.exports = Parser;

});

require.define("/node_modules/gherkin/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"./lib/gherkin"}
});

require.define("/node_modules/gherkin/lib/gherkin.js",function(require,module,exports,__dirname,__filename,process){/**
 * Creates a new Lexer for a specific language.
 */
exports.Lexer = function(lang) {
  return require('./gherkin/lexer/' + lang).Lexer;
};

/**
 * Creates a connect middleware for loading lexer sources (typically for browsers).
 */
exports.connect = function(path) {
  var gherkinFiles = require('connect').static(__dirname);

  return function(req, res, next) {
    if(req.url.indexOf(path) == 0) {
      req.url = req.url.slice(path.length);
      gherkinFiles(req, res, next);
    } else {
      next();
    }
  };
};
});

require.define("/node_modules/gherkin/lib/gherkin/lexer/en.js",function(require,module,exports,__dirname,__filename,process){
/* line 1 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
;(function() {


/* line 126 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */



/* line 11 "js/lib/gherkin/lexer/en.js" */
var _lexer_actions = [
	0, 1, 0, 1, 1, 1, 2, 1, 
	3, 1, 4, 1, 5, 1, 6, 1, 
	7, 1, 8, 1, 9, 1, 10, 1, 
	11, 1, 12, 1, 13, 1, 16, 1, 
	17, 1, 18, 1, 19, 1, 20, 1, 
	21, 1, 22, 1, 23, 2, 2, 18, 
	2, 3, 4, 2, 13, 0, 2, 14, 
	15, 2, 17, 0, 2, 17, 1, 2, 
	17, 16, 2, 17, 19, 2, 18, 6, 
	2, 18, 7, 2, 18, 8, 2, 18, 
	9, 2, 18, 10, 2, 18, 16, 2, 
	20, 21, 2, 22, 0, 2, 22, 1, 
	2, 22, 16, 2, 22, 19, 3, 4, 
	14, 15, 3, 5, 14, 15, 3, 11, 
	14, 15, 3, 12, 14, 15, 3, 13, 
	14, 15, 3, 14, 15, 18, 3, 17, 
	0, 11, 3, 17, 14, 15, 4, 2, 
	14, 15, 18, 4, 3, 4, 14, 15, 
	4, 17, 0, 14, 15, 5, 17, 0, 
	11, 14, 15
];

var _lexer_key_offsets = [
	0, 0, 19, 37, 38, 39, 41, 43, 
	48, 53, 58, 63, 67, 71, 73, 74, 
	75, 76, 77, 78, 79, 80, 81, 82, 
	83, 84, 85, 86, 87, 88, 89, 91, 
	93, 98, 105, 110, 112, 113, 114, 115, 
	116, 117, 118, 119, 120, 132, 134, 136, 
	138, 140, 142, 144, 146, 148, 150, 152, 
	154, 156, 158, 160, 162, 164, 166, 168, 
	170, 172, 174, 192, 194, 195, 196, 197, 
	198, 199, 200, 201, 202, 203, 204, 205, 
	220, 222, 224, 226, 228, 230, 232, 234, 
	236, 238, 240, 242, 244, 246, 248, 250, 
	253, 255, 257, 259, 261, 263, 265, 267, 
	269, 272, 274, 276, 278, 280, 282, 284, 
	286, 288, 290, 292, 294, 296, 298, 300, 
	302, 304, 306, 308, 310, 312, 314, 316, 
	318, 320, 322, 324, 326, 329, 332, 334, 
	336, 338, 340, 342, 344, 346, 348, 350, 
	352, 354, 356, 358, 359, 360, 361, 362, 
	363, 364, 365, 366, 367, 368, 369, 370, 
	371, 372, 373, 374, 375, 376, 377, 378, 
	387, 389, 391, 393, 395, 397, 399, 401, 
	403, 405, 407, 409, 411, 413, 415, 417, 
	419, 421, 423, 425, 427, 429, 431, 433, 
	435, 437, 438, 439, 440, 441, 442, 443, 
	444, 445, 446, 447, 448, 449, 450, 451, 
	452, 453, 454, 457, 459, 460, 461, 462, 
	463, 464, 465, 466, 467, 468, 483, 485, 
	487, 489, 491, 493, 495, 497, 499, 501, 
	503, 505, 507, 509, 511, 513, 516, 518, 
	520, 522, 524, 526, 528, 530, 532, 535, 
	537, 539, 541, 543, 545, 547, 549, 551, 
	553, 555, 557, 559, 561, 563, 565, 567, 
	569, 571, 573, 575, 577, 579, 581, 583, 
	585, 587, 589, 591, 592, 593, 594, 595, 
	596, 597, 598, 599, 614, 616, 618, 620, 
	622, 624, 626, 628, 630, 632, 634, 636, 
	638, 640, 642, 644, 647, 649, 651, 653, 
	655, 657, 659, 661, 664, 666, 668, 670, 
	672, 674, 676, 678, 680, 683, 685, 687, 
	689, 691, 693, 695, 697, 699, 701, 703, 
	705, 707, 709, 711, 713, 715, 717, 719, 
	721, 723, 725, 727, 729, 731, 733, 735, 
	738, 741, 743, 745, 747, 749, 751, 753, 
	755, 757, 759, 761, 763, 765, 766, 770, 
	776, 779, 781, 787, 805, 808, 810, 812, 
	814, 816, 818, 820, 822, 824, 826, 828, 
	830, 832, 834, 836, 838, 840, 842, 844, 
	846, 848, 850, 852, 854, 856, 858, 860, 
	862, 864, 866, 868, 870, 872, 874, 876, 
	878, 880, 882, 884, 888, 891, 893, 895, 
	897, 899, 901, 903, 905, 907, 909, 911, 
	913, 914, 915, 916
];

var _lexer_trans_keys = [
	10, 32, 34, 35, 37, 42, 64, 65, 
	66, 69, 70, 71, 83, 84, 87, 124, 
	239, 9, 13, 10, 32, 34, 35, 37, 
	42, 64, 65, 66, 69, 70, 71, 83, 
	84, 87, 124, 9, 13, 34, 34, 10, 
	13, 10, 13, 10, 32, 34, 9, 13, 
	10, 32, 34, 9, 13, 10, 32, 34, 
	9, 13, 10, 32, 34, 9, 13, 10, 
	32, 9, 13, 10, 32, 9, 13, 10, 
	13, 10, 95, 70, 69, 65, 84, 85, 
	82, 69, 95, 69, 78, 68, 95, 37, 
	32, 10, 13, 10, 13, 13, 32, 64, 
	9, 10, 9, 10, 13, 32, 64, 11, 
	12, 10, 32, 64, 9, 13, 98, 110, 
	105, 108, 105, 116, 121, 58, 10, 10, 
	10, 32, 35, 37, 64, 65, 66, 69, 
	70, 83, 9, 13, 10, 95, 10, 70, 
	10, 69, 10, 65, 10, 84, 10, 85, 
	10, 82, 10, 69, 10, 95, 10, 69, 
	10, 78, 10, 68, 10, 95, 10, 37, 
	10, 98, 10, 105, 10, 108, 10, 105, 
	10, 116, 10, 121, 10, 58, 10, 32, 
	34, 35, 37, 42, 64, 65, 66, 69, 
	70, 71, 83, 84, 87, 124, 9, 13, 
	97, 117, 99, 107, 103, 114, 111, 117, 
	110, 100, 58, 10, 10, 10, 32, 35, 
	37, 42, 64, 65, 66, 70, 71, 83, 
	84, 87, 9, 13, 10, 95, 10, 70, 
	10, 69, 10, 65, 10, 84, 10, 85, 
	10, 82, 10, 69, 10, 95, 10, 69, 
	10, 78, 10, 68, 10, 95, 10, 37, 
	10, 32, 10, 98, 110, 10, 105, 10, 
	108, 10, 105, 10, 116, 10, 121, 10, 
	58, 10, 100, 10, 117, 10, 115, 116, 
	10, 105, 10, 110, 10, 101, 10, 115, 
	10, 115, 10, 32, 10, 78, 10, 101, 
	10, 101, 10, 100, 10, 101, 10, 97, 
	10, 116, 10, 117, 10, 114, 10, 101, 
	10, 105, 10, 118, 10, 101, 10, 110, 
	10, 99, 10, 101, 10, 110, 10, 97, 
	10, 114, 10, 105, 10, 111, 10, 32, 
	58, 10, 79, 84, 10, 117, 10, 116, 
	10, 108, 10, 105, 10, 110, 10, 101, 
	10, 109, 10, 112, 10, 108, 10, 97, 
	10, 116, 10, 104, 115, 116, 105, 110, 
	101, 115, 115, 32, 78, 101, 101, 100, 
	120, 97, 109, 112, 108, 101, 115, 58, 
	10, 10, 10, 32, 35, 65, 66, 70, 
	124, 9, 13, 10, 98, 10, 105, 10, 
	108, 10, 105, 10, 116, 10, 121, 10, 
	58, 10, 117, 10, 115, 10, 105, 10, 
	110, 10, 101, 10, 115, 10, 115, 10, 
	32, 10, 78, 10, 101, 10, 101, 10, 
	100, 10, 101, 10, 97, 10, 116, 10, 
	117, 10, 114, 10, 101, 101, 97, 116, 
	117, 114, 101, 105, 118, 101, 110, 99, 
	101, 110, 97, 114, 105, 111, 32, 58, 
	115, 79, 84, 117, 116, 108, 105, 110, 
	101, 58, 10, 10, 10, 32, 35, 37, 
	42, 64, 65, 66, 70, 71, 83, 84, 
	87, 9, 13, 10, 95, 10, 70, 10, 
	69, 10, 65, 10, 84, 10, 85, 10, 
	82, 10, 69, 10, 95, 10, 69, 10, 
	78, 10, 68, 10, 95, 10, 37, 10, 
	32, 10, 98, 110, 10, 105, 10, 108, 
	10, 105, 10, 116, 10, 121, 10, 58, 
	10, 100, 10, 117, 10, 115, 116, 10, 
	105, 10, 110, 10, 101, 10, 115, 10, 
	115, 10, 32, 10, 78, 10, 101, 10, 
	101, 10, 100, 10, 101, 10, 97, 10, 
	116, 10, 117, 10, 114, 10, 101, 10, 
	105, 10, 118, 10, 101, 10, 110, 10, 
	99, 10, 101, 10, 110, 10, 97, 10, 
	114, 10, 105, 10, 111, 10, 104, 101, 
	109, 112, 108, 97, 116, 10, 10, 10, 
	32, 35, 37, 42, 64, 65, 66, 70, 
	71, 83, 84, 87, 9, 13, 10, 95, 
	10, 70, 10, 69, 10, 65, 10, 84, 
	10, 85, 10, 82, 10, 69, 10, 95, 
	10, 69, 10, 78, 10, 68, 10, 95, 
	10, 37, 10, 32, 10, 98, 110, 10, 
	105, 10, 108, 10, 105, 10, 116, 10, 
	121, 10, 58, 10, 100, 10, 97, 117, 
	10, 99, 10, 107, 10, 103, 10, 114, 
	10, 111, 10, 117, 10, 110, 10, 100, 
	10, 115, 116, 10, 105, 10, 110, 10, 
	101, 10, 115, 10, 115, 10, 32, 10, 
	78, 10, 101, 10, 101, 10, 101, 10, 
	97, 10, 116, 10, 117, 10, 114, 10, 
	101, 10, 105, 10, 118, 10, 101, 10, 
	110, 10, 99, 10, 101, 10, 110, 10, 
	97, 10, 114, 10, 105, 10, 111, 10, 
	32, 58, 10, 79, 84, 10, 117, 10, 
	116, 10, 108, 10, 105, 10, 110, 10, 
	101, 10, 109, 10, 112, 10, 108, 10, 
	97, 10, 116, 10, 104, 104, 32, 124, 
	9, 13, 10, 32, 92, 124, 9, 13, 
	10, 92, 124, 10, 92, 10, 32, 92, 
	124, 9, 13, 10, 32, 34, 35, 37, 
	42, 64, 65, 66, 69, 70, 71, 83, 
	84, 87, 124, 9, 13, 10, 97, 117, 
	10, 99, 10, 107, 10, 103, 10, 114, 
	10, 111, 10, 117, 10, 110, 10, 100, 
	10, 115, 10, 105, 10, 110, 10, 101, 
	10, 115, 10, 115, 10, 32, 10, 78, 
	10, 101, 10, 101, 10, 120, 10, 97, 
	10, 109, 10, 112, 10, 108, 10, 101, 
	10, 115, 10, 101, 10, 97, 10, 116, 
	10, 117, 10, 114, 10, 101, 10, 99, 
	10, 101, 10, 110, 10, 97, 10, 114, 
	10, 105, 10, 111, 10, 32, 58, 115, 
	10, 79, 84, 10, 117, 10, 116, 10, 
	108, 10, 105, 10, 110, 10, 101, 10, 
	109, 10, 112, 10, 108, 10, 97, 10, 
	116, 100, 187, 191, 0
];

var _lexer_single_lengths = [
	0, 17, 16, 1, 1, 2, 2, 3, 
	3, 3, 3, 2, 2, 2, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 2, 2, 
	3, 5, 3, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 10, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 16, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 13, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 3, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	3, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 3, 3, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 7, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 3, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 13, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 3, 2, 2, 
	2, 2, 2, 2, 2, 2, 3, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 1, 1, 1, 1, 1, 
	1, 1, 1, 13, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 3, 2, 2, 2, 2, 
	2, 2, 2, 3, 2, 2, 2, 2, 
	2, 2, 2, 2, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 3, 
	3, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 1, 2, 4, 
	3, 2, 4, 16, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 4, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	1, 1, 1, 0
];

var _lexer_range_lengths = [
	0, 1, 1, 0, 0, 0, 0, 1, 
	1, 1, 1, 1, 1, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	1, 1, 1, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 1, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 1, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 1, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 1, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 1, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 1, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 1, 1, 
	0, 0, 1, 1, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0
];

var _lexer_index_offsets = [
	0, 0, 19, 37, 39, 41, 44, 47, 
	52, 57, 62, 67, 71, 75, 78, 80, 
	82, 84, 86, 88, 90, 92, 94, 96, 
	98, 100, 102, 104, 106, 108, 110, 113, 
	116, 121, 128, 133, 136, 138, 140, 142, 
	144, 146, 148, 150, 152, 164, 167, 170, 
	173, 176, 179, 182, 185, 188, 191, 194, 
	197, 200, 203, 206, 209, 212, 215, 218, 
	221, 224, 227, 245, 248, 250, 252, 254, 
	256, 258, 260, 262, 264, 266, 268, 270, 
	285, 288, 291, 294, 297, 300, 303, 306, 
	309, 312, 315, 318, 321, 324, 327, 330, 
	334, 337, 340, 343, 346, 349, 352, 355, 
	358, 362, 365, 368, 371, 374, 377, 380, 
	383, 386, 389, 392, 395, 398, 401, 404, 
	407, 410, 413, 416, 419, 422, 425, 428, 
	431, 434, 437, 440, 443, 447, 451, 454, 
	457, 460, 463, 466, 469, 472, 475, 478, 
	481, 484, 487, 490, 492, 494, 496, 498, 
	500, 502, 504, 506, 508, 510, 512, 514, 
	516, 518, 520, 522, 524, 526, 528, 530, 
	539, 542, 545, 548, 551, 554, 557, 560, 
	563, 566, 569, 572, 575, 578, 581, 584, 
	587, 590, 593, 596, 599, 602, 605, 608, 
	611, 614, 616, 618, 620, 622, 624, 626, 
	628, 630, 632, 634, 636, 638, 640, 642, 
	644, 646, 648, 652, 655, 657, 659, 661, 
	663, 665, 667, 669, 671, 673, 688, 691, 
	694, 697, 700, 703, 706, 709, 712, 715, 
	718, 721, 724, 727, 730, 733, 737, 740, 
	743, 746, 749, 752, 755, 758, 761, 765, 
	768, 771, 774, 777, 780, 783, 786, 789, 
	792, 795, 798, 801, 804, 807, 810, 813, 
	816, 819, 822, 825, 828, 831, 834, 837, 
	840, 843, 846, 849, 851, 853, 855, 857, 
	859, 861, 863, 865, 880, 883, 886, 889, 
	892, 895, 898, 901, 904, 907, 910, 913, 
	916, 919, 922, 925, 929, 932, 935, 938, 
	941, 944, 947, 950, 954, 957, 960, 963, 
	966, 969, 972, 975, 978, 982, 985, 988, 
	991, 994, 997, 1000, 1003, 1006, 1009, 1012, 
	1015, 1018, 1021, 1024, 1027, 1030, 1033, 1036, 
	1039, 1042, 1045, 1048, 1051, 1054, 1057, 1060, 
	1064, 1068, 1071, 1074, 1077, 1080, 1083, 1086, 
	1089, 1092, 1095, 1098, 1101, 1104, 1106, 1110, 
	1116, 1120, 1123, 1129, 1147, 1151, 1154, 1157, 
	1160, 1163, 1166, 1169, 1172, 1175, 1178, 1181, 
	1184, 1187, 1190, 1193, 1196, 1199, 1202, 1205, 
	1208, 1211, 1214, 1217, 1220, 1223, 1226, 1229, 
	1232, 1235, 1238, 1241, 1244, 1247, 1250, 1253, 
	1256, 1259, 1262, 1265, 1270, 1274, 1277, 1280, 
	1283, 1286, 1289, 1292, 1295, 1298, 1301, 1304, 
	1307, 1309, 1311, 1313
];

var _lexer_indicies = [
	2, 1, 3, 4, 5, 6, 7, 8, 
	9, 10, 11, 12, 13, 14, 14, 15, 
	16, 1, 0, 2, 1, 3, 4, 5, 
	6, 7, 8, 9, 10, 11, 12, 13, 
	14, 14, 15, 1, 0, 17, 0, 18, 
	0, 20, 21, 19, 23, 24, 22, 27, 
	26, 28, 26, 25, 31, 30, 32, 30, 
	29, 31, 30, 33, 30, 29, 31, 30, 
	34, 30, 29, 36, 35, 35, 0, 2, 
	37, 37, 0, 39, 40, 38, 2, 0, 
	41, 0, 42, 0, 43, 0, 44, 0, 
	45, 0, 46, 0, 47, 0, 48, 0, 
	49, 0, 50, 0, 51, 0, 52, 0, 
	53, 0, 54, 0, 55, 0, 57, 58, 
	56, 60, 61, 59, 0, 0, 0, 0, 
	62, 63, 64, 63, 63, 66, 65, 62, 
	2, 67, 7, 67, 0, 68, 69, 0, 
	70, 0, 71, 0, 72, 0, 73, 0, 
	74, 0, 75, 0, 77, 76, 79, 78, 
	79, 80, 81, 82, 81, 83, 84, 85, 
	86, 87, 80, 78, 79, 88, 78, 79, 
	89, 78, 79, 90, 78, 79, 91, 78, 
	79, 92, 78, 79, 93, 78, 79, 94, 
	78, 79, 95, 78, 79, 96, 78, 79, 
	97, 78, 79, 98, 78, 79, 99, 78, 
	79, 100, 78, 79, 101, 78, 79, 102, 
	78, 79, 103, 78, 79, 104, 78, 79, 
	105, 78, 79, 106, 78, 79, 107, 78, 
	79, 108, 78, 110, 109, 111, 112, 113, 
	114, 115, 116, 117, 118, 119, 120, 121, 
	122, 122, 123, 109, 0, 124, 125, 0, 
	126, 0, 127, 0, 128, 0, 129, 0, 
	130, 0, 131, 0, 132, 0, 133, 0, 
	134, 0, 136, 135, 138, 137, 138, 139, 
	140, 141, 142, 140, 143, 144, 145, 146, 
	147, 148, 148, 139, 137, 138, 149, 137, 
	138, 150, 137, 138, 151, 137, 138, 152, 
	137, 138, 153, 137, 138, 154, 137, 138, 
	155, 137, 138, 156, 137, 138, 157, 137, 
	138, 158, 137, 138, 159, 137, 138, 160, 
	137, 138, 161, 137, 138, 162, 137, 138, 
	163, 137, 138, 164, 165, 137, 138, 166, 
	137, 138, 167, 137, 138, 168, 137, 138, 
	169, 137, 138, 170, 137, 138, 163, 137, 
	138, 171, 137, 138, 172, 137, 138, 173, 
	171, 137, 138, 174, 137, 138, 175, 137, 
	138, 176, 137, 138, 177, 137, 138, 178, 
	137, 138, 179, 137, 138, 180, 137, 138, 
	181, 137, 138, 182, 137, 138, 170, 137, 
	138, 183, 137, 138, 184, 137, 138, 185, 
	137, 138, 186, 137, 138, 187, 137, 138, 
	170, 137, 138, 188, 137, 138, 189, 137, 
	138, 190, 137, 138, 171, 137, 138, 191, 
	137, 138, 192, 137, 138, 193, 137, 138, 
	194, 137, 138, 195, 137, 138, 196, 137, 
	138, 197, 137, 138, 198, 163, 137, 138, 
	199, 200, 137, 138, 201, 137, 138, 202, 
	137, 138, 203, 137, 138, 204, 137, 138, 
	187, 137, 138, 205, 137, 138, 206, 137, 
	138, 207, 137, 138, 208, 137, 138, 209, 
	137, 138, 187, 137, 138, 189, 137, 210, 
	211, 0, 212, 0, 213, 0, 214, 0, 
	215, 0, 216, 0, 217, 0, 218, 0, 
	219, 0, 220, 0, 74, 0, 221, 0, 
	222, 0, 223, 0, 224, 0, 225, 0, 
	226, 0, 227, 0, 228, 0, 230, 229, 
	232, 231, 232, 233, 234, 235, 236, 237, 
	234, 233, 231, 232, 238, 231, 232, 239, 
	231, 232, 240, 231, 232, 241, 231, 232, 
	242, 231, 232, 243, 231, 232, 244, 231, 
	232, 245, 231, 232, 246, 231, 232, 247, 
	231, 232, 248, 231, 232, 249, 231, 232, 
	250, 231, 232, 251, 231, 232, 252, 231, 
	232, 253, 231, 232, 254, 231, 232, 255, 
	231, 232, 243, 231, 232, 256, 231, 232, 
	257, 231, 232, 258, 231, 232, 259, 231, 
	232, 260, 231, 232, 243, 231, 261, 0, 
	262, 0, 263, 0, 264, 0, 265, 0, 
	74, 0, 266, 0, 267, 0, 268, 0, 
	211, 0, 269, 0, 270, 0, 271, 0, 
	272, 0, 273, 0, 274, 0, 275, 0, 
	276, 277, 227, 0, 278, 279, 0, 280, 
	0, 281, 0, 282, 0, 283, 0, 284, 
	0, 285, 0, 286, 0, 288, 287, 290, 
	289, 290, 291, 292, 293, 294, 292, 295, 
	296, 297, 298, 299, 300, 300, 291, 289, 
	290, 301, 289, 290, 302, 289, 290, 303, 
	289, 290, 304, 289, 290, 305, 289, 290, 
	306, 289, 290, 307, 289, 290, 308, 289, 
	290, 309, 289, 290, 310, 289, 290, 311, 
	289, 290, 312, 289, 290, 313, 289, 290, 
	314, 289, 290, 315, 289, 290, 316, 317, 
	289, 290, 318, 289, 290, 319, 289, 290, 
	320, 289, 290, 321, 289, 290, 322, 289, 
	290, 315, 289, 290, 323, 289, 290, 324, 
	289, 290, 325, 323, 289, 290, 326, 289, 
	290, 327, 289, 290, 328, 289, 290, 329, 
	289, 290, 330, 289, 290, 331, 289, 290, 
	332, 289, 290, 333, 289, 290, 334, 289, 
	290, 322, 289, 290, 335, 289, 290, 336, 
	289, 290, 337, 289, 290, 338, 289, 290, 
	339, 289, 290, 322, 289, 290, 340, 289, 
	290, 341, 289, 290, 342, 289, 290, 323, 
	289, 290, 343, 289, 290, 344, 289, 290, 
	345, 289, 290, 346, 289, 290, 347, 289, 
	290, 348, 289, 290, 322, 289, 290, 341, 
	289, 349, 0, 350, 0, 351, 0, 352, 
	0, 353, 0, 284, 0, 355, 354, 357, 
	356, 357, 358, 359, 360, 361, 359, 362, 
	363, 364, 365, 366, 367, 367, 358, 356, 
	357, 368, 356, 357, 369, 356, 357, 370, 
	356, 357, 371, 356, 357, 372, 356, 357, 
	373, 356, 357, 374, 356, 357, 375, 356, 
	357, 376, 356, 357, 377, 356, 357, 378, 
	356, 357, 379, 356, 357, 380, 356, 357, 
	381, 356, 357, 382, 356, 357, 383, 384, 
	356, 357, 385, 356, 357, 386, 356, 357, 
	387, 356, 357, 388, 356, 357, 389, 356, 
	357, 382, 356, 357, 390, 356, 357, 391, 
	392, 356, 357, 393, 356, 357, 394, 356, 
	357, 395, 356, 357, 396, 356, 357, 397, 
	356, 357, 398, 356, 357, 399, 356, 357, 
	389, 356, 357, 400, 390, 356, 357, 401, 
	356, 357, 402, 356, 357, 403, 356, 357, 
	404, 356, 357, 405, 356, 357, 406, 356, 
	357, 407, 356, 357, 408, 356, 357, 399, 
	356, 357, 409, 356, 357, 410, 356, 357, 
	411, 356, 357, 412, 356, 357, 413, 356, 
	357, 389, 356, 357, 414, 356, 357, 415, 
	356, 357, 416, 356, 357, 390, 356, 357, 
	417, 356, 357, 418, 356, 357, 419, 356, 
	357, 420, 356, 357, 421, 356, 357, 422, 
	356, 357, 423, 356, 357, 424, 382, 356, 
	357, 425, 426, 356, 357, 427, 356, 357, 
	428, 356, 357, 429, 356, 357, 430, 356, 
	357, 413, 356, 357, 431, 356, 357, 432, 
	356, 357, 433, 356, 357, 434, 356, 357, 
	435, 356, 357, 413, 356, 357, 415, 356, 
	267, 0, 436, 437, 436, 0, 440, 439, 
	441, 442, 439, 438, 0, 444, 445, 443, 
	0, 444, 443, 440, 446, 444, 445, 446, 
	443, 440, 447, 448, 449, 450, 451, 452, 
	453, 454, 455, 456, 457, 458, 459, 459, 
	460, 447, 0, 79, 461, 462, 78, 79, 
	463, 78, 79, 464, 78, 79, 465, 78, 
	79, 466, 78, 79, 467, 78, 79, 468, 
	78, 79, 469, 78, 79, 107, 78, 79, 
	470, 78, 79, 471, 78, 79, 472, 78, 
	79, 473, 78, 79, 474, 78, 79, 475, 
	78, 79, 476, 78, 79, 477, 78, 79, 
	478, 78, 79, 469, 78, 79, 479, 78, 
	79, 480, 78, 79, 481, 78, 79, 482, 
	78, 79, 483, 78, 79, 484, 78, 79, 
	107, 78, 79, 485, 78, 79, 486, 78, 
	79, 487, 78, 79, 488, 78, 79, 489, 
	78, 79, 107, 78, 79, 490, 78, 79, 
	491, 78, 79, 492, 78, 79, 493, 78, 
	79, 494, 78, 79, 495, 78, 79, 496, 
	78, 79, 497, 108, 107, 78, 79, 498, 
	499, 78, 79, 500, 78, 79, 501, 78, 
	79, 502, 78, 79, 503, 78, 79, 489, 
	78, 79, 504, 78, 79, 505, 78, 79, 
	506, 78, 79, 507, 78, 79, 508, 78, 
	79, 489, 78, 211, 0, 509, 0, 1, 
	0, 510, 0
];

var _lexer_trans_targs = [
	0, 2, 2, 3, 13, 15, 29, 32, 
	35, 67, 157, 193, 199, 203, 357, 358, 
	417, 4, 5, 6, 7, 6, 6, 7, 
	6, 8, 8, 8, 9, 8, 8, 8, 
	9, 10, 11, 12, 2, 12, 13, 2, 
	14, 16, 17, 18, 19, 20, 21, 22, 
	23, 24, 25, 26, 27, 28, 419, 30, 
	31, 2, 14, 31, 2, 14, 33, 34, 
	2, 33, 32, 34, 36, 416, 37, 38, 
	39, 40, 41, 42, 43, 44, 43, 44, 
	44, 2, 45, 59, 364, 383, 390, 396, 
	46, 47, 48, 49, 50, 51, 52, 53, 
	54, 55, 56, 57, 58, 2, 60, 61, 
	62, 63, 64, 65, 66, 2, 2, 3, 
	13, 15, 29, 32, 35, 67, 157, 193, 
	199, 203, 357, 358, 68, 146, 69, 70, 
	71, 72, 73, 74, 75, 76, 77, 78, 
	79, 78, 79, 79, 2, 80, 94, 95, 
	103, 115, 121, 125, 145, 81, 82, 83, 
	84, 85, 86, 87, 88, 89, 90, 91, 
	92, 93, 2, 66, 96, 102, 97, 98, 
	99, 100, 101, 94, 104, 105, 106, 107, 
	108, 109, 110, 111, 112, 113, 114, 116, 
	117, 118, 119, 120, 122, 123, 124, 126, 
	127, 128, 129, 130, 131, 132, 133, 134, 
	139, 135, 136, 137, 138, 140, 141, 142, 
	143, 144, 147, 29, 148, 149, 150, 151, 
	152, 153, 154, 155, 156, 158, 159, 160, 
	161, 162, 163, 164, 165, 166, 167, 166, 
	167, 167, 2, 168, 175, 187, 169, 170, 
	171, 172, 173, 174, 66, 176, 177, 178, 
	179, 180, 181, 182, 183, 184, 185, 186, 
	188, 189, 190, 191, 192, 194, 195, 196, 
	197, 198, 200, 201, 202, 204, 205, 206, 
	207, 208, 209, 210, 211, 281, 212, 275, 
	213, 214, 215, 216, 217, 218, 219, 220, 
	221, 220, 221, 221, 2, 222, 236, 237, 
	245, 257, 263, 267, 274, 223, 224, 225, 
	226, 227, 228, 229, 230, 231, 232, 233, 
	234, 235, 2, 66, 238, 244, 239, 240, 
	241, 242, 243, 236, 246, 247, 248, 249, 
	250, 251, 252, 253, 254, 255, 256, 258, 
	259, 260, 261, 262, 264, 265, 266, 268, 
	269, 270, 271, 272, 273, 276, 277, 278, 
	279, 280, 282, 283, 282, 283, 283, 2, 
	284, 298, 299, 307, 326, 332, 336, 356, 
	285, 286, 287, 288, 289, 290, 291, 292, 
	293, 294, 295, 296, 297, 2, 66, 300, 
	306, 301, 302, 303, 304, 305, 298, 308, 
	316, 309, 310, 311, 312, 313, 314, 315, 
	317, 318, 319, 320, 321, 322, 323, 324, 
	325, 327, 328, 329, 330, 331, 333, 334, 
	335, 337, 338, 339, 340, 341, 342, 343, 
	344, 345, 350, 346, 347, 348, 349, 351, 
	352, 353, 354, 355, 358, 359, 360, 362, 
	363, 361, 359, 360, 361, 359, 362, 363, 
	3, 13, 15, 29, 32, 35, 67, 157, 
	193, 199, 203, 357, 358, 365, 373, 366, 
	367, 368, 369, 370, 371, 372, 374, 375, 
	376, 377, 378, 379, 380, 381, 382, 384, 
	385, 386, 387, 388, 389, 391, 392, 393, 
	394, 395, 397, 398, 399, 400, 401, 402, 
	403, 404, 405, 410, 406, 407, 408, 409, 
	411, 412, 413, 414, 415, 418, 0
];

var _lexer_trans_actions = [
	43, 0, 54, 3, 1, 0, 29, 1, 
	29, 29, 29, 29, 29, 29, 29, 35, 
	0, 0, 0, 7, 139, 48, 0, 102, 
	9, 5, 45, 134, 45, 0, 33, 122, 
	33, 33, 0, 11, 106, 0, 0, 114, 
	25, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	57, 149, 126, 0, 110, 23, 0, 27, 
	118, 27, 51, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 57, 144, 0, 54, 
	0, 69, 33, 84, 84, 84, 84, 84, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 13, 0, 0, 
	0, 0, 0, 0, 13, 31, 130, 60, 
	57, 31, 63, 57, 63, 63, 63, 63, 
	63, 63, 63, 66, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 57, 
	144, 0, 54, 0, 72, 33, 84, 84, 
	84, 84, 84, 84, 84, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 15, 15, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 57, 144, 0, 
	54, 0, 81, 84, 84, 84, 0, 0, 
	0, 0, 0, 0, 21, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 57, 
	144, 0, 54, 0, 78, 33, 84, 84, 
	84, 84, 84, 84, 84, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 19, 19, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 57, 144, 0, 54, 0, 75, 
	33, 84, 84, 84, 84, 84, 84, 84, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 17, 17, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 37, 37, 
	54, 37, 87, 0, 0, 39, 0, 0, 
	93, 90, 41, 96, 90, 96, 96, 96, 
	96, 96, 96, 96, 99, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0
];

var _lexer_eof_actions = [
	0, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43
];

var lexer_start = 1;
var lexer_first_final = 419;
var lexer_error = 0;

var lexer_en_main = 1;


/* line 129 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

/* line 130 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

/* line 131 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

var Lexer = function(listener) {
  // Check that listener has the required functions
  var events = ['comment', 'tag', 'feature', 'background', 'scenario', 'scenario_outline', 'examples', 'step', 'doc_string', 'row', 'eof'];
  for(e in events) {
    var event = events[e];
    if(typeof listener[event] != 'function') {
      throw "Error. No " + event + " function exists on " + JSON.stringify(listener);
    }
  }
  this.listener = listener;
};

Lexer.prototype.scan = function(data) {
  var ending = "\n%_FEATURE_END_%";
  if(typeof data == 'string') {
    data = this.stringToBytes(data + ending);
  } else if(typeof Buffer != 'undefined' && Buffer.isBuffer(data)) {
    // Node.js
    var buf = new Buffer(data.length + ending.length);
    data.copy(buf, 0, 0);
    new Buffer(ending).copy(buf, data.length, 0);
    data = buf;
  }
  var eof = pe = data.length;
  var p = 0;

  this.line_number = 1;
  this.last_newline = 0;

  
/* line 778 "js/lib/gherkin/lexer/en.js" */
{
	  this.cs = lexer_start;
} /* JSCodeGen::writeInit */

/* line 162 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
  
/* line 785 "js/lib/gherkin/lexer/en.js" */
{
	var _klen, _trans, _keys, _ps, _widec, _acts, _nacts;
	var _goto_level, _resume, _eof_trans, _again, _test_eof;
	var _out;
	_klen = _trans = _keys = _acts = _nacts = null;
	_goto_level = 0;
	_resume = 10;
	_eof_trans = 15;
	_again = 20;
	_test_eof = 30;
	_out = 40;
	while (true) {
	_trigger_goto = false;
	if (_goto_level <= 0) {
	if (p == pe) {
		_goto_level = _test_eof;
		continue;
	}
	if ( this.cs == 0) {
		_goto_level = _out;
		continue;
	}
	}
	if (_goto_level <= _resume) {
	_keys = _lexer_key_offsets[ this.cs];
	_trans = _lexer_index_offsets[ this.cs];
	_klen = _lexer_single_lengths[ this.cs];
	_break_match = false;
	
	do {
	  if (_klen > 0) {
	     _lower = _keys;
	     _upper = _keys + _klen - 1;

	     while (true) {
	        if (_upper < _lower) { break; }
	        _mid = _lower + ( (_upper - _lower) >> 1 );

	        if ( data[p] < _lexer_trans_keys[_mid]) {
	           _upper = _mid - 1;
	        } else if ( data[p] > _lexer_trans_keys[_mid]) {
	           _lower = _mid + 1;
	        } else {
	           _trans += (_mid - _keys);
	           _break_match = true;
	           break;
	        };
	     } /* while */
	     if (_break_match) { break; }
	     _keys += _klen;
	     _trans += _klen;
	  }
	  _klen = _lexer_range_lengths[ this.cs];
	  if (_klen > 0) {
	     _lower = _keys;
	     _upper = _keys + (_klen << 1) - 2;
	     while (true) {
	        if (_upper < _lower) { break; }
	        _mid = _lower + (((_upper-_lower) >> 1) & ~1);
	        if ( data[p] < _lexer_trans_keys[_mid]) {
	          _upper = _mid - 2;
	         } else if ( data[p] > _lexer_trans_keys[_mid+1]) {
	          _lower = _mid + 2;
	        } else {
	          _trans += ((_mid - _keys) >> 1);
	          _break_match = true;
	          break;
	        }
	     } /* while */
	     if (_break_match) { break; }
	     _trans += _klen
	  }
	} while (false);
	_trans = _lexer_indicies[_trans];
	 this.cs = _lexer_trans_targs[_trans];
	if (_lexer_trans_actions[_trans] != 0) {
		_acts = _lexer_trans_actions[_trans];
		_nacts = _lexer_actions[_acts];
		_acts += 1;
		while (_nacts > 0) {
			_nacts -= 1;
			_acts += 1;
			switch (_lexer_actions[_acts - 1]) {
case 0:
/* line 6 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
    this.current_line = this.line_number;
    this.start_col = p - this.last_newline - (this.keyword+':').length;
  		break;
case 1:
/* line 12 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.current_line = this.line_number;
    this.start_col = p - this.last_newline;
  		break;
case 2:
/* line 17 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
  		break;
case 3:
/* line 21 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.docstring_content_type_start = p;
  		break;
case 4:
/* line 25 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.docstring_content_type_end = p;
  		break;
case 5:
/* line 29 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.unindent(
      this.start_col, 
      this.bytesToString(data.slice(this.content_start, this.next_keyword_start-1)).replace(/(\r?\n)?([\t ])*$/, '').replace(/\\\"\\\"\\\"/mg, '"""')
    );
    var con_type = this.bytesToString(data.slice(this.docstring_content_type_start, this.docstring_content_type_end)).trim();
    this.listener.doc_string(con_type, con, this.current_line); 
  		break;
case 6:
/* line 38 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('feature', data, p, eof);
  		break;
case 7:
/* line 42 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('background', data, p, eof);
  		break;
case 8:
/* line 46 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('scenario', data, p, eof);
  		break;
case 9:
/* line 50 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('scenario_outline', data, p, eof);
  		break;
case 10:
/* line 54 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('examples', data, p, eof);
  		break;
case 11:
/* line 58 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.step(this.keyword, con, this.current_line);
  		break;
case 12:
/* line 63 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.comment(con, this.line_number);
    this.keyword_start = null;
  		break;
case 13:
/* line 69 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.tag(con, this.line_number);
    this.keyword_start = null;
  		break;
case 14:
/* line 75 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.line_number++;
  		break;
case 15:
/* line 79 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.last_newline = p + 1;
  		break;
case 16:
/* line 83 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.keyword_start = this.keyword_start || p;
  		break;
case 17:
/* line 87 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.keyword = this.bytesToString(data.slice(this.keyword_start, p)).replace(/:$/, '');
    this.keyword_start = null;
  		break;
case 18:
/* line 92 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.next_keyword_start = p;
  		break;
case 19:
/* line 96 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = p - 1;
    current_row = [];
    this.current_line = this.line_number;
  		break;
case 20:
/* line 102 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
  		break;
case 21:
/* line 106 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    current_row.push(con.replace(/\\\|/, "|").replace(/\\n/, "\n").replace(/\\\\/, "\\"));
  		break;
case 22:
/* line 111 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.listener.row(current_row, this.current_line);
  		break;
case 23:
/* line 115 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    if(this.cs < lexer_first_final) {
      var content = this.current_line_content(data, p);
      throw "Lexing error on line " + this.line_number + ": '" + content + "'. See http://wiki.github.com/cucumber/gherkin/lexingerror for more information.";
    } else {
      this.listener.eof();
    }
    
  		break;
/* line 1012 "js/lib/gherkin/lexer/en.js" */
			} /* action switch */
		}
	}
	if (_trigger_goto) {
		continue;
	}
	}
	if (_goto_level <= _again) {
	if ( this.cs == 0) {
		_goto_level = _out;
		continue;
	}
	p += 1;
	if (p != pe) {
		_goto_level = _resume;
		continue;
	}
	}
	if (_goto_level <= _test_eof) {
	if (p == eof) {
	__acts = _lexer_eof_actions[ this.cs];
	__nacts =  _lexer_actions[__acts];
	__acts += 1;
	while (__nacts > 0) {
		__nacts -= 1;
		__acts += 1;
		switch (_lexer_actions[__acts - 1]) {
case 23:
/* line 115 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    if(this.cs < lexer_first_final) {
      var content = this.current_line_content(data, p);
      throw "Lexing error on line " + this.line_number + ": '" + content + "'. See http://wiki.github.com/cucumber/gherkin/lexingerror for more information.";
    } else {
      this.listener.eof();
    }
    
  		break;
/* line 1051 "js/lib/gherkin/lexer/en.js" */
		} /* eof action switch */
	}
	if (_trigger_goto) {
		continue;
	}
}
	}
	if (_goto_level <= _out) {
		break;
	}
	}
	}

/* line 163 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
};

Lexer.prototype.bytesToString = function(bytes) {
  if(typeof bytes.write == 'function') {
    // Node.js
    return bytes.toString('utf-8');
  } else {
    var result = "";
    for(var b in bytes) {
      result += String.fromCharCode(bytes[b]);
    }
    return result;
  }
};

Lexer.prototype.stringToBytes = function(string) {
  var bytes = [];
  for(var i = 0; i < string.length; i++) {
    bytes[i] = string.charCodeAt(i);
  }
  return bytes;
};

Lexer.prototype.unindent = function(startcol, text) {
  startcol = startcol || 0;
  return text.replace(new RegExp('^[\t ]{0,' + startcol + '}', 'gm'), ''); 
};

Lexer.prototype.store_keyword_content = function(event, data, p, eof) {
  var end_point = (!this.next_keyword_start || (p == eof)) ? p : this.next_keyword_start;
  var content = this.unindent(this.start_col + 2, this.bytesToString(data.slice(this.content_start, end_point))).replace(/\s+$/,"");
  var content_lines = content.split("\n")
  var name = content_lines.shift() || "";
  name = name.trim();
  var description = content_lines.join("\n");
  this.listener[event](this.keyword, name, description, this.current_line);
  var nks = this.next_keyword_start;
  this.next_keyword_start = null;
  return nks ? nks - 1 : p;
};

Lexer.prototype.current_line_content = function(data, p) {
  var rest = data.slice(this.last_newline, -1);
  var end = rest.indexOf(10) || -1;
  return this.bytesToString(rest.slice(0, end)).trim();
};

// Node.js export
if(typeof module !== 'undefined') {
  module.exports = Lexer;
}
// Require.js export
if (typeof define !== 'undefined') {
  if(define.amd) {
    define('gherkin/lexer/en', [], function() {
      return Lexer
    });
  } else {
    define('gherkin/lexer/en', function(require, exports, module) {
      exports.Lexer = Lexer;
    });
  }
}

})();

});

require.define("/cucumber/runtime",function(require,module,exports,__dirname,__filename,process){var Runtime = function(configuration) {
  var Cucumber = require('../cucumber');

  var listeners = Cucumber.Type.Collection();

  var self = {
    start: function start(callback) {
      if (typeof(callback) !== 'function')
        throw new Error(Runtime.START_MISSING_CALLBACK_ERROR);
      var features           = self.getFeatures();
      var supportCodeLibrary = self.getSupportCodeLibrary();
      var astTreeWalker      = Runtime.AstTreeWalker(features, supportCodeLibrary, listeners);
      astTreeWalker.walk(callback);
    },

    attachListener: function attachListener(listener) {
      listeners.add(listener);
    },

    getFeatures: function getFeatures() {
      var featureSources = configuration.getFeatureSources();
      var astFilter      = configuration.getAstFilter();
      var parser         = Cucumber.Parser(featureSources, astFilter);
      var features       = parser.parse();
      return features;
    },

    getSupportCodeLibrary: function getSupportCodeLibrary() {
      var supportCodeLibrary = configuration.getSupportCodeLibrary();
      return supportCodeLibrary;
    }
  };
  return self;
};
Runtime.START_MISSING_CALLBACK_ERROR = "Cucumber.Runtime.start() expects a callback";
Runtime.AstTreeWalker        = require('./runtime/ast_tree_walker');
Runtime.StepResult           = require('./runtime/step_result');
Runtime.SuccessfulStepResult = require('./runtime/successful_step_result');
Runtime.PendingStepResult    = require('./runtime/pending_step_result');
Runtime.FailedStepResult     = require('./runtime/failed_step_result');
Runtime.SkippedStepResult    = require('./runtime/skipped_step_result');
Runtime.UndefinedStepResult  = require('./runtime/undefined_step_result');
module.exports               = Runtime;

});

require.define("/cucumber/runtime/ast_tree_walker",function(require,module,exports,__dirname,__filename,process){var AstTreeWalker = function(features, supportCodeLibrary, listeners) {
  var Cucumber = require('../../cucumber');

  var listeners;
  var world;
  var allFeaturesSucceded = true;
  var skippingSteps       = false;

  var self = {
    walk: function walk(callback) {
      self.visitFeatures(features, function() {
        var featuresResult = self.didAllFeaturesSucceed();
        callback(featuresResult);
      });
    },

    visitFeatures: function visitFeatures(features, callback) {
      var event = AstTreeWalker.Event(AstTreeWalker.FEATURES_EVENT_NAME);
      self.broadcastEventAroundUserFunction(
        event,
        function(callback) { features.acceptVisitor(self, callback); },
        callback
      );
    },

    visitFeature: function visitFeature(feature, callback) {
      var payload = { feature: feature };
      var event   = AstTreeWalker.Event(AstTreeWalker.FEATURE_EVENT_NAME, payload);
      self.broadcastEventAroundUserFunction(
        event,
        function(callback) { feature.acceptVisitor(self, callback); },
        callback
      );
    },

    visitBackground: function visitBackground(background, callback) {
 	    var payload = { background: background };
 	    var event   = AstTreeWalker.Event(AstTreeWalker.BACKGROUND_EVENT_NAME, payload);
 	    self.broadcastEvent(event, callback);
 	  },

    visitScenario: function visitScenario(scenario, callback) {
      supportCodeLibrary.instantiateNewWorld(function(world) {
        self.setWorld(world);
        self.witnessNewScenario();
        var payload = { scenario: scenario };
        var event   = AstTreeWalker.Event(AstTreeWalker.SCENARIO_EVENT_NAME, payload);
        var hookedUpScenarioVisit = supportCodeLibrary.hookUpFunction(
          function(callback) { scenario.acceptVisitor(self, callback); },
          scenario,
          world
        );
        self.broadcastEventAroundUserFunction(
          event,
          hookedUpScenarioVisit,
          callback
        );
      });
    },

    visitStep: function visitStep(step, callback) {
      var payload = { step: step };
      var event   = AstTreeWalker.Event(AstTreeWalker.STEP_EVENT_NAME, payload);
      self.broadcastEventAroundUserFunction(
        event,
        function(callback) {
          self.processStep(step, callback);
        },
        callback
      );
    },

    visitStepResult: function visitStepResult(stepResult, callback) {
      if (stepResult.isFailed())
        self.witnessFailedStep();
      else if (stepResult.isPending())
        self.witnessPendingStep();
      var payload = { stepResult: stepResult };
      var event   = AstTreeWalker.Event(AstTreeWalker.STEP_RESULT_EVENT_NAME, payload);
      self.broadcastEvent(event, callback);
    },

    broadcastEventAroundUserFunction: function broadcastEventAroundUserFunction(event, userFunction, callback) {
      var userFunctionWrapper = self.wrapUserFunctionAndAfterEventBroadcast(userFunction, event, callback);
      self.broadcastBeforeEvent(event, userFunctionWrapper);
    },

    wrapUserFunctionAndAfterEventBroadcast: function wrapUserFunctionAndAfterEventBroadcast(userFunction, event, callback) {
      var callAfterEventBroadcast = self.wrapAfterEventBroadcast(event, callback);
      return function callUserFunctionAndBroadcastAfterEvent() {
        userFunction(callAfterEventBroadcast);
      };
    },

    wrapAfterEventBroadcast: function wrapAfterEventBroadcast(event, callback) {
      return function() { self.broadcastAfterEvent(event, callback); };
    },

    broadcastBeforeEvent: function broadcastBeforeEvent(event, callback) {
      var preEvent = event.replicateAsPreEvent();
      self.broadcastEvent(preEvent, callback);
    },

    broadcastAfterEvent: function broadcastAfterEvent(event, callback) {
      var postEvent = event.replicateAsPostEvent();
      self.broadcastEvent(postEvent, callback);
    },

    broadcastEvent: function broadcastEvent(event, callback) {
      listeners.forEach(
        function(listener, callback) { listener.hear(event, callback); },
        callback
      );
    },

    lookupStepDefinitionByName: function lookupStepDefinitionByName(stepName) {
      return supportCodeLibrary.lookupStepDefinitionByName(stepName);
    },

    setWorld: function setWorld(newWorld) {
      world = newWorld;
    },

    getWorld: function getWorld() {
      return world;
    },

    isStepUndefined: function isStepUndefined(step) {
      var stepName = step.getName();
      return !supportCodeLibrary.isStepDefinitionNameDefined(stepName);
    },

    didAllFeaturesSucceed: function didAllFeaturesSucceed() {
      return allFeaturesSucceded;
    },

    witnessFailedStep: function witnessFailedStep() {
      allFeaturesSucceded = false;
      skippingSteps       = true;
    },

    witnessPendingStep: function witnessPendingStep() {
      skippingSteps = true;
    },

    witnessUndefinedStep: function witnessUndefinedStep() {
      skippingSteps = true;
    },

    witnessNewScenario: function witnessNewScenario() {
      skippingSteps = false;
    },

    isSkippingSteps: function isSkippingSteps() {
      return skippingSteps;
    },

    processStep: function processStep(step, callback) {
      if (self.isStepUndefined(step)) {
        self.witnessUndefinedStep();
        self.skipUndefinedStep(step, callback);
      } else if (self.isSkippingSteps()) {
        self.skipStep(step, callback);
      } else {
        self.executeStep(step, callback);
      }
    },

    executeStep: function executeStep(step, callback) {
      step.acceptVisitor(self, callback);
    },

    skipStep: function skipStep(step, callback) {
      var skippedStepResult = Cucumber.Runtime.SkippedStepResult({step: step});
      var payload           = { stepResult: skippedStepResult };
      var event             = AstTreeWalker.Event(AstTreeWalker.STEP_RESULT_EVENT_NAME, payload);
      self.broadcastEvent(event, callback);
    },

    skipUndefinedStep: function skipUndefinedStep(step, callback) {
      var undefinedStepResult = Cucumber.Runtime.UndefinedStepResult({step: step});
      var payload = { stepResult: undefinedStepResult };
      var event   = AstTreeWalker.Event(AstTreeWalker.STEP_RESULT_EVENT_NAME, payload);
      self.broadcastEvent(event, callback);
    }
  };
  return self;
};
AstTreeWalker.FEATURES_EVENT_NAME                 = 'Features';
AstTreeWalker.FEATURE_EVENT_NAME                  = 'Feature';
AstTreeWalker.BACKGROUND_EVENT_NAME               = 'Background';
AstTreeWalker.SCENARIO_EVENT_NAME                 = 'Scenario';
AstTreeWalker.STEP_EVENT_NAME                     = 'Step';
AstTreeWalker.STEP_RESULT_EVENT_NAME              = 'StepResult';
AstTreeWalker.BEFORE_EVENT_NAME_PREFIX            = 'Before';
AstTreeWalker.AFTER_EVENT_NAME_PREFIX             = 'After';
AstTreeWalker.NON_EVENT_LEADING_PARAMETERS_COUNT  = 0;
AstTreeWalker.NON_EVENT_TRAILING_PARAMETERS_COUNT = 2;
AstTreeWalker.Event                               = require('./ast_tree_walker/event');
module.exports                                    = AstTreeWalker;

});

require.define("/cucumber/runtime/ast_tree_walker/event",function(require,module,exports,__dirname,__filename,process){var Event = function(name, payload) {
  var AstTreeWalker = require('../ast_tree_walker');

  var self = {
    getName: function getName() {
      return name;
    },

    getPayloadItem: function getPayloadItem(itemName) {
      return payload[itemName];
    },

    replicateAsPreEvent: function replicateAsPreEvent() {
      var newName = buildBeforeEventName(name);
      return AstTreeWalker.Event(newName, payload);
    },

    replicateAsPostEvent: function replicateAsPostEvent() {
      var newName = buildAfterEventName(name);
      return AstTreeWalker.Event(newName, payload);
    },

    occurredOn: function occurredOn(eventName) {
      return eventName == name;
    },

    occurredAfter: function occurredAfter(eventName) {
      var afterEventName = buildAfterEventName(eventName);
      return afterEventName == name;
    }
  };

  function buildBeforeEventName(eventName) {
    return AstTreeWalker.BEFORE_EVENT_NAME_PREFIX + eventName;
  }

  function buildAfterEventName(eventName) {
    return AstTreeWalker.AFTER_EVENT_NAME_PREFIX + eventName;
  }

  return self;
};
module.exports = Event;

});

require.define("/cucumber/runtime/step_result",function(require,module,exports,__dirname,__filename,process){var StepResult = function (payload) {
  var self = {
    isFailed:     function isFailed()     { return false; },
    isPending:    function isPending()    { return false; },
    isSkipped:    function isSkipped()    { return false; },
    isSuccessful: function isSuccessful() { return false; },
    isUndefined:  function isUndefined()  { return false; },

    getStep: function getStep() {
      return payload.step;
    }
  };

  return self;
};

module.exports = StepResult;
});

require.define("/cucumber/runtime/successful_step_result",function(require,module,exports,__dirname,__filename,process){var SuccessfulStepResult = function(payload) {
  var Cucumber = require('../../cucumber');

  var self = Cucumber.Runtime.StepResult(payload);

  self.isSuccessful = function isSuccessful() { return true; };

  return self;
};
module.exports = SuccessfulStepResult;

});

require.define("/cucumber/runtime/pending_step_result",function(require,module,exports,__dirname,__filename,process){var PendingStepResult = function(payload) {
  var Cucumber = require('../../cucumber');

  var self = Cucumber.Runtime.StepResult(payload);

  self.isPending = function isPending() { return true; };

  return self;
};
module.exports = PendingStepResult;

});

require.define("/cucumber/runtime/failed_step_result",function(require,module,exports,__dirname,__filename,process){var FailedStepResult = function(payload) {
  var Cucumber = require('../../cucumber');

  var self = Cucumber.Runtime.StepResult(payload);

  self.isFailed = function isFailed() { return true; };

  self.getFailureException = function getFailureException() {
    return payload.failureException;
  };

  return self;
};
module.exports = FailedStepResult;

});

require.define("/cucumber/runtime/skipped_step_result",function(require,module,exports,__dirname,__filename,process){var SkippedStepResult = function(payload) {
  var Cucumber = require('../../cucumber');

  var self = Cucumber.Runtime.StepResult(payload);

  self.isSkipped = function isSkipped() { return true; };

  return self;
};
module.exports = SkippedStepResult;

});

require.define("/cucumber/runtime/undefined_step_result",function(require,module,exports,__dirname,__filename,process){var UndefinedStepResult = function(payload) {
  var Cucumber = require('../../cucumber');

  var self = Cucumber.Runtime.StepResult(payload);

  self.isUndefined = function isUndefined() { return true; };

  return self;
};
module.exports = UndefinedStepResult;

});

require.define("/cucumber/support_code",function(require,module,exports,__dirname,__filename,process){var SupportCode                          = {};
SupportCode.Hook                         = require('./support_code/hook');
SupportCode.Library                      = require('./support_code/library');
SupportCode.StepDefinition               = require('./support_code/step_definition');
SupportCode.StepDefinitionSnippetBuilder = require('./support_code/step_definition_snippet_builder');
SupportCode.WorldConstructor             = require('./support_code/world_constructor');
module.exports                           = SupportCode;

});

require.define("/cucumber/support_code/hook",function(require,module,exports,__dirname,__filename,process){var _ = require('underscore');

var Hook = function(code, options) {
  var Cucumber = require('../../cucumber');

  var tags = options['tags'] || [];

  var self = {
    invokeBesideScenario: function invokeBesideScenario(scenario, world, callback) {
      if (self.appliesToScenario(scenario))
        code.call(world, callback);
      else
        callback(function(endPostScenarioAroundHook) { endPostScenarioAroundHook(); });
    },

    appliesToScenario: function appliesToScenario(scenario) {
      var astFilter = self.getAstFilter();
      return astFilter.isElementEnrolled(scenario);
    },

    getAstFilter: function getAstFilter() {
      var tagGroups = Cucumber.TagGroupParser.getTagGroupsFromStrings(tags);
      var rules = _.map(tagGroups, function(tagGroup) {
        var rule = Cucumber.Ast.Filter.AnyOfTagsRule(tagGroup);
        return rule;
      });
      var astFilter = Cucumber.Ast.Filter(rules);
      return astFilter;
    }
  };
  return self;
};
module.exports = Hook;

});

require.define("/node_modules/underscore/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/underscore/underscore.js",function(require,module,exports,__dirname,__filename,process){//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1), true);
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);

});

require.define("/cucumber/support_code/library",function(require,module,exports,__dirname,__filename,process){var Library = function(supportCodeDefinition) {
  var Cucumber = require('../../cucumber');

  var stepDefinitions  = Cucumber.Type.Collection();
  var hooker           = Cucumber.SupportCode.Library.Hooker();
  var worldConstructor = Cucumber.SupportCode.WorldConstructor();

  var self = {
    lookupStepDefinitionByName: function lookupStepDefinitionByName(name) {
      var matchingStepDefinition;

      stepDefinitions.syncForEach(function(stepDefinition) {
        if (stepDefinition.matchesStepName(name)) {
          matchingStepDefinition = stepDefinition;
        }
      });
      return matchingStepDefinition;
    },

    isStepDefinitionNameDefined: function isStepDefinitionNameDefined(name) {
      var stepDefinition = self.lookupStepDefinitionByName(name);
      return (stepDefinition != undefined);
    },

    hookUpFunction: function hookUpFunction(userFunction, scenario, world) {
      var hookedUpFunction = hooker.hookUpFunction(userFunction, scenario, world);
      return hookedUpFunction;
    },

    defineAroundHook: function defineAroundHook() {
      var tagGroupStrings = Cucumber.Util.Arguments(arguments);
      var code            = tagGroupStrings.pop();
      hooker.addAroundHookCode(code, {tags: tagGroupStrings});
    },

    defineBeforeHook: function defineBeforeHook() {
      var tagGroupStrings = Cucumber.Util.Arguments(arguments);
      var code            = tagGroupStrings.pop();
      hooker.addBeforeHookCode(code, {tags: tagGroupStrings});
    },

    defineAfterHook: function defineAfterHook() {
      var tagGroupStrings = Cucumber.Util.Arguments(arguments);
      var code            = tagGroupStrings.pop();
      hooker.addAfterHookCode(code, {tags: tagGroupStrings});
    },

    defineStep: function defineStep(name, code) {
      var stepDefinition = Cucumber.SupportCode.StepDefinition(name, code);
      stepDefinitions.add(stepDefinition);
    },

    instantiateNewWorld: function instantiateNewWorld(callback) {
      var world = new worldConstructor(function(explicitWorld) {
        process.nextTick(function() { // release the constructor
          callback(explicitWorld || world);
        });
      });
    }
  };

  var supportCodeHelper = {
    Around     : self.defineAroundHook,
    Before     : self.defineBeforeHook,
    After      : self.defineAfterHook,
    Given      : self.defineStep,
    When       : self.defineStep,
    Then       : self.defineStep,
    defineStep : self.defineStep,
    World      : worldConstructor
  };
  supportCodeDefinition.call(supportCodeHelper);
  worldConstructor = supportCodeHelper.World;

  return self;
};
Library.Hooker = require('./library/hooker');
module.exports = Library;

});

require.define("/cucumber/support_code/library/hooker",function(require,module,exports,__dirname,__filename,process){var Hooker = function() {
  var Cucumber = require('../../../cucumber');

  var aroundHooks = Cucumber.Type.Collection();
  var beforeHooks = Cucumber.Type.Collection();
  var afterHooks  = Cucumber.Type.Collection();

  var self = {
    addAroundHookCode: function addAroundHookCode(code, options) {
      var aroundHook = Cucumber.SupportCode.Hook(code, options);
      aroundHooks.add(aroundHook);
    },

    addBeforeHookCode: function addBeforeHookCode(code, options) {
      var beforeHook = Cucumber.SupportCode.Hook(code, options);
      beforeHooks.add(beforeHook);
    },

    addAfterHookCode: function addAfterHookCode(code, options) {
      var afterHook = Cucumber.SupportCode.Hook(code, options);
      afterHooks.unshift(afterHook);
    },

    hookUpFunction: function hookUpFunction(userFunction, scenario, world) {
      var hookedUpFunction = function(callback) {
        var postScenarioAroundHookCallbacks = Cucumber.Type.Collection();
        aroundHooks.forEach(callPreScenarioAroundHook, callBeforeHooks);

        function callPreScenarioAroundHook(aroundHook, preScenarioAroundHookCallback) {
          aroundHook.invokeBesideScenario(scenario, world, function(postScenarioAroundHookCallback) {
            postScenarioAroundHookCallbacks.unshift(postScenarioAroundHookCallback);
            preScenarioAroundHookCallback();
          });
        }

        function callBeforeHooks() {
          self.triggerBeforeHooks(scenario, world, callUserFunction);
        }

        function callUserFunction() {
          userFunction(callAfterHooks);
        }

        function callAfterHooks() {
          self.triggerAfterHooks(scenario, world, callPostScenarioAroundHooks);
        }

        function callPostScenarioAroundHooks() {
          postScenarioAroundHookCallbacks.forEach(
            callPostScenarioAroundHook,
            callback
          );
        }

        function callPostScenarioAroundHook(postScenarioAroundHookCallback, callback) {
          postScenarioAroundHookCallback.call(world, callback);
        }
      };
      return hookedUpFunction;
    },

    triggerBeforeHooks: function triggerBeforeHooks(scenario, world, callback) {
      beforeHooks.forEach(function(beforeHook, callback) {
        beforeHook.invokeBesideScenario(scenario, world, callback);
      }, callback);
    },

    triggerAfterHooks: function triggerAfterHooks(scenario, world, callback) {
      afterHooks.forEach(function(afterHook, callback) {
        afterHook.invokeBesideScenario(scenario, world, callback);
      }, callback);
    }
  };
  return self;
};
module.exports = Hooker;

});

require.define("/cucumber/support_code/step_definition",function(require,module,exports,__dirname,__filename,process){var StepDefinition = function (pattern, code) {
  var Cucumber = require('../../cucumber');

  var self = {
    getPatternRegexp: function getPatternRegexp() {
      var regexp;
      if (pattern.replace) {
        var regexpString = pattern
          .replace(StepDefinition.UNSAFE_STRING_CHARACTERS_REGEXP, StepDefinition.PREVIOUS_REGEXP_MATCH)
          .replace(StepDefinition.QUOTED_DOLLAR_PARAMETER_REGEXP, StepDefinition.QUOTED_DOLLAR_PARAMETER_SUBSTITUTION)
          .replace(StepDefinition.DOLLAR_PARAMETER_REGEXP, StepDefinition.DOLLAR_PARAMETER_SUBSTITUTION);
        regexpString =
          StepDefinition.STRING_PATTERN_REGEXP_PREFIX +
          regexpString +
          StepDefinition.STRING_PATTERN_REGEXP_SUFFIX;
        regexp = RegExp(regexpString);
      }
      else
        regexp = pattern;
      return regexp;
    },

    matchesStepName: function matchesStepName(stepName) {
      var regexp = self.getPatternRegexp();
      return regexp.test(stepName);
    },

    invoke: function invoke(step, world, callback) {
      var cleanUp = function cleanUp() {
        Cucumber.Util.Exception.unregisterUncaughtExceptionHandler(handleException);
      };

      var codeCallback = function (error) {
        if (error) {
          codeCallback.fail(error);
        } else {
          var successfulStepResult = Cucumber.Runtime.SuccessfulStepResult({step: step});
          cleanUp();
          callback(successfulStepResult);
        }
      };

      codeCallback.pending = function pending(reason) {
        var pendingStepResult = Cucumber.Runtime.PendingStepResult({step: step, pendingReason: reason});
        cleanUp();
        callback(pendingStepResult);
      };

      codeCallback.fail = function fail(failureReason) {
        var failureException = failureReason || new Error(StepDefinition.UNKNOWN_STEP_FAILURE_MESSAGE);
        var failedStepResult = Cucumber.Runtime.FailedStepResult({step: step, failureException: failureException});
        cleanUp();
        callback(failedStepResult);
      };

      var parameters      = self.buildInvocationParameters(step, codeCallback);
      var handleException = self.buildExceptionHandlerToCodeCallback(codeCallback);
      Cucumber.Util.Exception.registerUncaughtExceptionHandler(handleException);

      try {
        code.apply(world, parameters);
      } catch (exception) {
        handleException(exception);
      }
    },

    buildInvocationParameters: function buildInvocationParameters(step, callback) {
      var stepName      = step.getName();
      var patternRegexp = self.getPatternRegexp();
      var parameters    = patternRegexp.exec(stepName);
      parameters.shift();
      if (step.hasAttachment()) {
        var attachmentContents = step.getAttachmentContents();
        parameters.push(attachmentContents);
      }
      parameters.push(callback);
      return parameters;
    },

    buildExceptionHandlerToCodeCallback: function buildExceptionHandlerToCodeCallback(codeCallback) {
      var exceptionHandler = function handleScenarioException(exception) {
        if (exception)
          Cucumber.Debug.warn(exception.stack || exception, 'exception inside feature', 3);
        codeCallback.fail(exception);
      };
      return exceptionHandler;
    }
  };
  return self;
};

StepDefinition.DOLLAR_PARAMETER_REGEXP              = /\$[a-zA-Z_-]+/;
StepDefinition.DOLLAR_PARAMETER_SUBSTITUTION        = '(.*)';
StepDefinition.PREVIOUS_REGEXP_MATCH                = "\\$&";
StepDefinition.QUOTED_DOLLAR_PARAMETER_REGEXP       = /"\$[a-zA-Z_-]+"/;
StepDefinition.QUOTED_DOLLAR_PARAMETER_SUBSTITUTION = '"([^"]*)"';
StepDefinition.STRING_PATTERN_REGEXP_PREFIX         = '^';
StepDefinition.STRING_PATTERN_REGEXP_SUFFIX         = '$';
StepDefinition.UNSAFE_STRING_CHARACTERS_REGEXP      = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\|]/g;
StepDefinition.UNKNOWN_STEP_FAILURE_MESSAGE         = "Step failure";

module.exports = StepDefinition;

});

require.define("/cucumber/support_code/step_definition_snippet_builder",function(require,module,exports,__dirname,__filename,process){var _  = require('underscore');

var StepDefinitionSnippetBuilder = function(step) {
  var Cucumber = require('../../cucumber');

  var self = {
    buildSnippet: function buildSnippet() {
      var functionName = self.buildStepDefinitionFunctionName();
      var pattern      = self.buildStepDefinitionPattern();
      var parameters   = self.buildStepDefinitionParameters();
      var snippet =
        StepDefinitionSnippetBuilder.STEP_DEFINITION_START  +
        functionName                                        +
        StepDefinitionSnippetBuilder.STEP_DEFINITION_INNER1 +
        pattern                                             +
        StepDefinitionSnippetBuilder.STEP_DEFINITION_INNER2 +
        parameters                                          +
        StepDefinitionSnippetBuilder.STEP_DEFINITION_END;
      return snippet;
    },

    buildStepDefinitionFunctionName: function buildStepDefinitionFunctionName() {
      var functionName;
      if (step.isOutcomeStep())
        functionName = StepDefinitionSnippetBuilder.OUTCOME_STEP_DEFINITION_FUNCTION_NAME;
      else if (step.isEventStep())
        functionName = StepDefinitionSnippetBuilder.EVENT_STEP_DEFINITION_FUNCTION_NAME;
      else
        functionName = StepDefinitionSnippetBuilder.CONTEXT_STEP_DEFINITION_FUNCTION_NAME;
      return functionName;
    },

    buildStepDefinitionPattern: function buildStepDefinitionPattern() {
      var stepName              = step.getName();
      var escapedStepName       = Cucumber.Util.RegExp.escapeString(stepName);
      var parameterizedStepName = self.parameterizeStepName(escapedStepName);
      var pattern               =
        StepDefinitionSnippetBuilder.PATTERN_START +
        parameterizedStepName                      +
        StepDefinitionSnippetBuilder.PATTERN_END
      return pattern;
    },

    buildStepDefinitionParameters: function buildStepDefinitionParameters() {
      var parameters = self.getStepDefinitionPatternMatchingGroupParameters();
      if (step.hasDocString())
        parameters = parameters.concat([StepDefinitionSnippetBuilder.STEP_DEFINITION_DOC_STRING]);
      else if (step.hasDataTable())
        parameters = parameters.concat([StepDefinitionSnippetBuilder.STEP_DEFINITION_DATA_TABLE]);
      var parametersAndCallback =
        parameters.concat([StepDefinitionSnippetBuilder.STEP_DEFINITION_CALLBACK]);
      var parameterString = parametersAndCallback.join(StepDefinitionSnippetBuilder.FUNCTION_PARAMETER_SEPARATOR);
      return parameterString;
    },

    getStepDefinitionPatternMatchingGroupParameters: function getStepDefinitionPatternMatchingGroupParameters() {
      var parameterCount = self.countStepDefinitionPatternMatchingGroups();
      var parameters = [];
      _(parameterCount).times(function(n) {
        var offset = n + 1;
        parameters.push('arg' + offset);
      });
      return parameters;
    },

    countStepDefinitionPatternMatchingGroups: function countStepDefinitionPatternMatchingGroups() {
      var stepDefinitionPattern    = self.buildStepDefinitionPattern();
      var numberMatchingGroupCount =
        Cucumber.Util.String.count(stepDefinitionPattern, StepDefinitionSnippetBuilder.NUMBER_MATCHING_GROUP);
      var quotedStringMatchingGroupCount =
        Cucumber.Util.String.count(stepDefinitionPattern, StepDefinitionSnippetBuilder.QUOTED_STRING_MATCHING_GROUP);
      var count = numberMatchingGroupCount + quotedStringMatchingGroupCount;
      return count;
    },

    parameterizeStepName: function parameterizeStepName(stepName) {
      var parameterizedStepName =
        stepName
        .replace(StepDefinitionSnippetBuilder.NUMBER_PATTERN, StepDefinitionSnippetBuilder.NUMBER_MATCHING_GROUP)
        .replace(StepDefinitionSnippetBuilder.QUOTED_STRING_PATTERN, StepDefinitionSnippetBuilder.QUOTED_STRING_MATCHING_GROUP);
      return parameterizedStepName;
    }
  };
  return self;
};

StepDefinitionSnippetBuilder.STEP_DEFINITION_START                 = 'this.';
StepDefinitionSnippetBuilder.STEP_DEFINITION_INNER1                = '(';
StepDefinitionSnippetBuilder.STEP_DEFINITION_INNER2                = ', function(';
StepDefinitionSnippetBuilder.STEP_DEFINITION_END                   = ") {\n  // express the regexp above with the code you wish you had\n  callback.pending();\n});\n";
StepDefinitionSnippetBuilder.STEP_DEFINITION_DOC_STRING            = 'string';
StepDefinitionSnippetBuilder.STEP_DEFINITION_DATA_TABLE            = 'table';
StepDefinitionSnippetBuilder.STEP_DEFINITION_CALLBACK              = 'callback';
StepDefinitionSnippetBuilder.PATTERN_START                         = '/^';
StepDefinitionSnippetBuilder.PATTERN_END                           = '$/';
StepDefinitionSnippetBuilder.CONTEXT_STEP_DEFINITION_FUNCTION_NAME = 'Given';
StepDefinitionSnippetBuilder.EVENT_STEP_DEFINITION_FUNCTION_NAME   = 'When';
StepDefinitionSnippetBuilder.OUTCOME_STEP_DEFINITION_FUNCTION_NAME = 'Then';
StepDefinitionSnippetBuilder.NUMBER_PATTERN                        = /\d+/gi;
StepDefinitionSnippetBuilder.NUMBER_MATCHING_GROUP                 = '(\\d+)';
StepDefinitionSnippetBuilder.QUOTED_STRING_PATTERN                 = /"[^"]*"/gi;
StepDefinitionSnippetBuilder.QUOTED_STRING_MATCHING_GROUP          = '"([^"]*)"';
StepDefinitionSnippetBuilder.FUNCTION_PARAMETER_SEPARATOR          = ', ';
module.exports = StepDefinitionSnippetBuilder;

});

require.define("/cucumber/support_code/world_constructor",function(require,module,exports,__dirname,__filename,process){var WorldConstructor = function() {
  return function World(callback) { callback() };
};
module.exports = WorldConstructor;

});

require.define("/cucumber/tag_group_parser",function(require,module,exports,__dirname,__filename,process){var _ = require('underscore');

var TagGroupParser = function(tagGroupString) {
  var self = {
    parse: function parse() {
      var splitTags = tagGroupString.split(TagGroupParser.TAG_SEPARATOR);
      var trimmedTags = _.map(splitTags, function(tag) { return tag.trim(); });
      return trimmedTags;
    }
  };
  return self;
};

TagGroupParser.getTagGroupsFromStrings = function getTagGroupsFromStrings(tagGroupStrings) {
  var Cucumber = require('../cucumber');

  var tagGroups = _.map(tagGroupStrings, function(tagOptionValue) {
    var tagGroupParser = Cucumber.TagGroupParser(tagOptionValue);
    var tagGroup       = tagGroupParser.parse();
    return tagGroup;
  });
  return tagGroups;
};

TagGroupParser.TAG_SEPARATOR = ',';
module.exports = TagGroupParser;

});

require.define("/cucumber/type",function(require,module,exports,__dirname,__filename,process){var Type           = {};
Type.Collection    = require('./type/collection');
Type.HashDataTable = require('./type/hash_data_table');
Type.String        = require('./type/string');
module.exports     = Type;

});

require.define("/cucumber/type/collection",function(require,module,exports,__dirname,__filename,process){var Collection = function() {
  var items = new Array();
  var self = {
    add:         function add(item)                       { items.push(item); },
    unshift:     function unshift(item)                   { items.unshift(item); },
    getLast:     function getLast()                       { return items[items.length-1]; },
    syncForEach: function syncForEach(userFunction)       { items.forEach(userFunction); },
    forEach:     function forEach(userFunction, callback) {
      var itemsCopy = items.slice(0);
      function iterate() {
        if (itemsCopy.length > 0) {
          processItem();
        } else {
          callback();
        };
      }
      function processItem() {
        var item = itemsCopy.shift();
        userFunction(item, function() {
          iterate();
        });
      };
      iterate();
    },
    length: function length() { return items.length; }
  };
  return self;
};
module.exports = Collection;

});

require.define("/cucumber/type/hash_data_table",function(require,module,exports,__dirname,__filename,process){var HashDataTable = function(rawArray) {
  var self = {
    raw: function raw() {
      var hashKeys        = self.getHashKeys();
      var hashValueArrays = self.getHashValueArrays();
      var hashes          = self.createHashesFromKeysAndValueArrays(hashKeys, hashValueArrays);
      return hashes;
    },

    getHashKeys: function getHashKeys() {
      return rawArray[0];
    },

    getHashValueArrays: function getHashValueArrays() {
      var _rawArray = [].concat(rawArray);
      _rawArray.shift();
      return _rawArray;
    },

    createHashesFromKeysAndValueArrays: function createHashesFromKeysAndValueArrays(keys, valueArrays) {
      var hashes = [];
      valueArrays.forEach(function(values) {
        var hash = self.createHashFromKeysAndValues(keys, values);
        hashes.push(hash);
      });
      return hashes;
    },

    createHashFromKeysAndValues: function createHashFromKeysAndValues(keys, values) {
      var hash = {};
      var len  = keys.length;
      for (var i = 0; i < len; i++) {
        hash[keys[i]] = values[i];
      }
      return hash;
    }
  };
  return self;
};

module.exports = HashDataTable;
});

require.define("/cucumber/type/string",function(require,module,exports,__dirname,__filename,process){if(!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g,'');
  };
}
module.exports = String;

});

require.define("/cucumber/util",function(require,module,exports,__dirname,__filename,process){var Util       = {};
Util.Arguments = require('./util/arguments');
Util.Exception = require('./util/exception');
Util.RegExp    = require('./util/reg_exp');
Util.String    = require('./util/string');
module.exports = Util;

});

require.define("/cucumber/util/arguments",function(require,module,exports,__dirname,__filename,process){var Arguments = function Arguments(argumentsObject) {
  return Array.prototype.slice.call(argumentsObject);
};
module.exports = Arguments;
});

require.define("/cucumber/util/exception",function(require,module,exports,__dirname,__filename,process){var Exception = {
  registerUncaughtExceptionHandler: function registerUncaughtExceptionHandler(exceptionHandler) {
    if (process.on)
      process.on('uncaughtException', exceptionHandler);
    else
      window.onerror = exceptionHandler;
  },

  unregisterUncaughtExceptionHandler: function unregisterUncaughtExceptionHandler(exceptionHandler) {
    if (process.removeListener)
      process.removeListener('uncaughtException', exceptionHandler);
    else
     window.onerror = void(0);
  }
};

module.exports = Exception;

});

require.define("/cucumber/util/reg_exp",function(require,module,exports,__dirname,__filename,process){var RegExp = {
  escapeString: function escapeString(string) {
    var escaped = string.replace(RegExp.ESCAPE_PATTERN, RegExp.ESCAPE_REPLACEMENT);
    return escaped;
  }
};

RegExp.ESCAPE_PATTERN     = /[-[\]{}()*+?.\\^$|#\n\/]/g;
RegExp.ESCAPE_REPLACEMENT = "\\$&";
module.exports = RegExp;

});

require.define("/cucumber/util/string",function(require,module,exports,__dirname,__filename,process){var String = {
  count: function count(hayStack, needle) {
    var splitHayStack = hayStack.split(needle);
    return splitHayStack.length - 1;
  }
};
module.exports = String;

});

require.define("/cucumber/volatile_configuration",function(require,module,exports,__dirname,__filename,process){var VolatileConfiguration = function VolatileConfiguration(features, supportCodeInitializer, options) {
  var Cucumber = require('../cucumber');
  var supportCodeLibrary = Cucumber.SupportCode.Library(supportCodeInitializer);

  options = options || {};
  var tagGroupStrings = options['tags'] || [];

  var self = {
    getFeatureSources: function getFeatureSources() {
      if (features.replace) { // single source
        var featureNameSourcePair = [VolatileConfiguration.FEATURE_SOURCE_NAME, features];
        return [featureNameSourcePair];
      } else { // multiple features
        return features;
      }
    },

    getAstFilter: function getAstFilter() {
      var tagRules = self.getTagAstFilterRules();
      var astFilter = Cucumber.Ast.Filter(tagRules);
      return astFilter;
    },

    getSupportCodeLibrary: function getSupportCodeLibrary() {
      return supportCodeLibrary;
    },

    getTagAstFilterRules: function getTagAstFilterRules() {
      var rules = [];
      tagGroupStrings.forEach(function(tagGroupString) {
        var rule = self.buildAstFilterRuleFromTagGroupString(tagGroupString);
        rules.push(rule);
      });
      return rules;
    },

    buildAstFilterRuleFromTagGroupString: function buildAstFilterRuleFromTagGroupString(tagGroupString) {
      var tagGroupParser = Cucumber.TagGroupParser(tagGroupString);
      var tagGroup       = tagGroupParser.parse();
      var rule           = Cucumber.Ast.Filter.AnyOfTagsRule(tagGroup);
      return rule;
    }
  };
  return self;
};
VolatileConfiguration.FEATURE_SOURCE_NAME = "(feature)";
module.exports = VolatileConfiguration;

});

require.define("/cucumber/ast/data_table",function(require,module,exports,__dirname,__filename,process){var DataTable  = function() {
  var Cucumber = require('../../cucumber');

  var rows = Cucumber.Type.Collection();

  var self = {
    attachRow: function attachRow(row) {
      rows.add(row);
    },

    getContents: function getContents() {
      return self;
    },

    raw: function raw() {
      rawRows = [];
      rows.syncForEach(function(row) {
        var rawRow = row.raw();
        rawRows.push(rawRow);
      });
      return rawRows;
    },

    hashes: function hashes() {
      var raw              = self.raw();
      var hashDataTable    = Cucumber.Type.HashDataTable(raw);
      var rawHashDataTable = hashDataTable.raw();
      return rawHashDataTable;
    }
  };
  return self;
};
DataTable.Row  = require('./data_table/row');
module.exports = DataTable;

});

require.define("/cucumber/ast/data_table/row",function(require,module,exports,__dirname,__filename,process){var Row = function(cells, uri, line) {
  var Cucumber = require('../../../cucumber');

  self = {
    raw: function raw() {
      return cells;
    }
  };
  return self;
}
module.exports = Row;

});

require.define("/cucumber/ast/doc_string",function(require,module,exports,__dirname,__filename,process){var DocString = function(contentType, contents, uri, line) {
  var self = {
    getContents: function getContents() {
      return contents;
    },

    getContentType: function getContentType() {
      return contentType;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    }
  };
  return self;
};
module.exports = DocString;

});

require.define("/cucumber/ast/feature",function(require,module,exports,__dirname,__filename,process){var Feature = function(keyword, name, description, uri, line) {
  var Cucumber = require('../../cucumber');

  var background;
  var scenarios = Cucumber.Type.Collection();
  var tags      = [];

  var self = {
    getKeyword: function getKeyword() {
      return keyword;
    },

    getName: function getName() {
      return name;
    },

    getDescription: function getDescription() {
      return description;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    },

    addBackground: function addBackground(newBackground) {
      background = newBackground;
    },

    getBackground: function getBackground() {
      return background;
    },

    hasBackground: function hasBackground() {
      return (typeof(background) != 'undefined');
    },

    addScenario: function addScenario(scenario) {
      var background = self.getBackground();
      scenario.setBackground(background);
      scenarios.add(scenario);
    },

    getLastScenario: function getLastScenario() {
      return scenarios.getLast();
    },

    hasScenarios: function hasScenarios() {
      return scenarios.length() > 0;
    },

    addTags: function setTags(newTags) {
      tags = tags.concat(newTags);
    },

    getTags: function getTags() {
      return tags;
    },

    acceptVisitor: function acceptVisitor(visitor, callback) {
      self.instructVisitorToVisitBackground(visitor, function() {
        self.instructVisitorToVisitScenarios(visitor, callback);
      });
    },

    instructVisitorToVisitBackground: function instructVisitorToVisitBackground(visitor, callback) {
      if (self.hasBackground()) {
        var background = self.getBackground();
        visitor.visitBackground(background, callback);
      } else {
        callback();
      }
    },

    instructVisitorToVisitScenarios: function instructVisitorToVisitScenarios(visitor, callback) {
      scenarios.forEach(function(scenario, iterate) {
        visitor.visitScenario(scenario, iterate);
      }, callback);
    }
  };
  return self;
};
module.exports = Feature;

});

require.define("/cucumber/ast/features",function(require,module,exports,__dirname,__filename,process){var Features = function() {
  var Cucumber = require('../../cucumber');

  var features = Cucumber.Type.Collection();

  var self = {
    addFeature: function addFeature(feature) {
      features.add(feature);
    },

    getLastFeature: function getLastFeature() {
      return features.getLast();
    },

    acceptVisitor: function acceptVisitor(visitor, callback) {
      features.forEach(function(feature, iterate) {
        visitor.visitFeature(feature, iterate);
      }, callback);
    }
  };
  return self;
};
module.exports = Features;

});

require.define("/cucumber/ast/filter",function(require,module,exports,__dirname,__filename,process){var _ = require('underscore');

var Filter = function(rules) {
  var self = {
    isElementEnrolled: function isElementEnrolled(element) {
      var enrolled = _.all(rules, function(rule) {
        return rule.isSatisfiedByElement(element);
      });
      return enrolled;
    }
  };
  return self;
};
Filter.AnyOfTagsRule          = require('./filter/any_of_tags_rule');
Filter.ElementMatchingTagSpec = require('./filter/element_matching_tag_spec');
module.exports = Filter;

});

require.define("/cucumber/ast/filter/any_of_tags_rule",function(require,module,exports,__dirname,__filename,process){var _ = require('underscore');

var AnyOfTagsRule = function(tags) {
  var Cucumber = require('../../../cucumber');

  var self = {
    isSatisfiedByElement: function isSatisfiedByElement(element) {
      var satisfied = _.any(tags, function(tag) {
        var spec = Cucumber.Ast.Filter.ElementMatchingTagSpec(tag);
        return spec.isMatching(element);
      });
      return satisfied;
    }
  };
  return self;
};
module.exports = AnyOfTagsRule;

});

require.define("/cucumber/ast/filter/element_matching_tag_spec",function(require,module,exports,__dirname,__filename,process){var _ = require('underscore');

var ElementMatchingTagSpec = function(tagName) {
  var self = {
    isMatching: function isMatching(element) {
      var elementTags = element.getTags();
      var matching;
      if (self.isExpectingTag())
        matching = _.any(elementTags, self.isTagSatisfying);
      else
        matching = _.all(elementTags, self.isTagSatisfying);
      return matching;
    },

    isTagSatisfying: function isTagSatisfying(tag) {
      var checkedTagName = tag.getName();
      var satisfying;
      if (self.isExpectingTag())
        satisfying = checkedTagName == tagName;
      else {
        var negatedCheckedTagName = ElementMatchingTagSpec.NEGATION_CHARACTER + checkedTagName;
        satisfying = negatedCheckedTagName != tagName;
      }
      return satisfying;
    },

    isExpectingTag: function isExpectingTag() {
      var expectingTag = tagName[0] != ElementMatchingTagSpec.NEGATION_CHARACTER;
      return expectingTag;
    }
  };
  return self;
};
ElementMatchingTagSpec.NEGATION_CHARACTER = '~';
module.exports = ElementMatchingTagSpec;

});

require.define("/cucumber/ast/scenario",function(require,module,exports,__dirname,__filename,process){var Scenario = function(keyword, name, description, uri, line) {
  var Cucumber = require('../../cucumber');

  var background;
  var steps = Cucumber.Type.Collection();
  var tags  = [];

  var self = {
    setBackground: function setBackground(newBackground) {
      background = newBackground;
    },

    getKeyword: function getKeyword() {
      return keyword;
    },

    getName: function getName() {
      return name;
    },

    getDescription: function getDescription() {
      return description;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    },

    getBackground: function getBackground() {
      return background;
    },

    addStep: function addStep(step) {
      var lastStep = self.getLastStep();
      step.setPreviousStep(lastStep);
      steps.add(step);
    },

    getLastStep: function getLastStep() {
      return steps.getLast();
    },

    addTags: function setTags(newTags) {
      tags = tags.concat(newTags);
    },

    getTags: function getTags() {
      return tags;
    },

    acceptVisitor: function acceptVisitor(visitor, callback) {
      self.instructVisitorToVisitBackgroundSteps(visitor, function() {
        self.instructVisitorToVisitScenarioSteps(visitor, callback);
      });
    },

    instructVisitorToVisitBackgroundSteps: function instructVisitorToVisitBackgroundSteps(visitor, callback) {
      var background = self.getBackground();
      if (typeof(background) != 'undefined') {
        var steps = background.getSteps();
        self.instructVisitorToVisitSteps(visitor, steps, callback);
      } else {
        callback();
      }
    },

    instructVisitorToVisitScenarioSteps: function instructVisitorToVisitScenarioSteps(visitor, callback) {
      self.instructVisitorToVisitSteps(visitor, steps, callback);
    },

    instructVisitorToVisitSteps: function instructVisitorToVisitSteps(visitor, steps, callback) {
      steps.forEach(function(step, iterate) {
        visitor.visitStep(step, iterate);
      }, callback);
    }
  };
  return self;
};
module.exports = Scenario;

});

require.define("/cucumber/ast/step",function(require,module,exports,__dirname,__filename,process){var Step = function(keyword, name, uri, line) {
  var Cucumber = require('../../cucumber');
  var docString, dataTable, previousStep;

  var self = {
    setPreviousStep: function setPreviousStep(newPreviousStep) {
      previousStep = newPreviousStep;
    },

    getKeyword: function getKeyword() {
      return keyword;
    },

    getName: function getName() {
      return name;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    },

    getPreviousStep: function getPreviousStep() {
      return previousStep;
    },

    hasPreviousStep: function hasPreviousStep() {
      return !!previousStep;
    },

    getAttachment: function getAttachment() {
      var attachment;
      if (self.hasDocString()) {
        attachment = self.getDocString();
      } else if (self.hasDataTable()) {
        attachment = self.getDataTable();
      }
      return attachment;
    },

    getAttachmentContents: function getAttachmentContents() {
      var attachment         = self.getAttachment();
      var attachmentContents;
      if (attachment)
        attachmentContents = attachment.getContents();
      return attachmentContents;
    },

    getDocString: function getDocString() { return docString; },

    getDataTable: function getDataTable() { return dataTable; },

    hasAttachment: function hasAttachment() {
      return self.hasDocString() || self.hasDataTable();
    },

    hasDocString: function hasDocString() {
      return !!docString;
    },

    hasDataTable: function hasDataTable() {
      return !!dataTable;
    },

    attachDocString: function attachDocString(_docString) { docString = _docString; },

    attachDataTable: function attachDataTable(_dataTable) { dataTable = _dataTable; },

    attachDataTableRow: function attachDataTableRow(row) {
      self.ensureDataTableIsAttached();
      var dataTable = self.getDataTable();
      dataTable.attachRow(row);
    },

    ensureDataTableIsAttached: function ensureDataTableIsAttached() {
      var dataTable = self.getDataTable();
      if (!dataTable) {
        dataTable = Cucumber.Ast.DataTable();
        self.attachDataTable(dataTable);
      }
    },

    isOutcomeStep: function isOutcomeStep() {
      var isOutcomeStep =
        self.hasOutcomeStepKeyword() || self.isRepeatingOutcomeStep();
      return isOutcomeStep;
    },

    isEventStep: function isEventStep() {
      var isEventStep =
        self.hasEventStepKeyword() || self.isRepeatingEventStep();
      return isEventStep;
    },

    hasOutcomeStepKeyword: function hasOutcomeStepKeyword() {
      var hasOutcomeStepKeyword =
        keyword == Step.OUTCOME_STEP_KEYWORD;
      return hasOutcomeStepKeyword;
    },

    hasEventStepKeyword: function hasEventStepKeyword() {
      var hasEventStepKeyword =
        keyword == Step.EVENT_STEP_KEYWORD;
      return hasEventStepKeyword;
    },

    isRepeatingOutcomeStep: function isRepeatingOutcomeStep() {
      var isRepeatingOutcomeStep =
        self.hasRepeatStepKeyword() && self.isPrecededByOutcomeStep();
      return isRepeatingOutcomeStep;
    },

    isRepeatingEventStep: function isRepeatingEventStep() {
      var isRepeatingEventStep =
        self.hasRepeatStepKeyword() && self.isPrecededByEventStep();
      return isRepeatingEventStep;
    },

    hasRepeatStepKeyword: function hasRepeatStepKeyword() {
      var hasRepeatStepKeyword =
        keyword == Step.AND_STEP_KEYWORD || keyword == Step.BUT_STEP_KEYWORD || keyword == Step.STAR_STEP_KEYWORD;
      return hasRepeatStepKeyword;
    },

    isPrecededByOutcomeStep: function isPrecededByOutcomeStep() {
      var isPrecededByOutcomeStep = false;

      if (self.hasPreviousStep()) {
        var previousStep            = self.getPreviousStep();
        var isPrecededByOutcomeStep = previousStep.isOutcomeStep();
      }
      return isPrecededByOutcomeStep;
    },

    isPrecededByEventStep: function isPrecededByEventStep() {
      var isPrecededByEventStep = false;

      if (self.hasPreviousStep()) {
        var previousStep          = self.getPreviousStep();
        var isPrecededByEventStep = previousStep.isEventStep();
      }
      return isPrecededByEventStep;
    },

    acceptVisitor: function acceptVisitor(visitor, callback) {
      self.execute(visitor, function(stepResult) {
        visitor.visitStepResult(stepResult, callback);
      });
    },

    execute: function execute(visitor, callback) {
      var stepDefinition = visitor.lookupStepDefinitionByName(name);
      var world          = visitor.getWorld();
      stepDefinition.invoke(self, world, callback);
    }
  };
  return self;
};
Step.EVENT_STEP_KEYWORD   = 'When ';
Step.OUTCOME_STEP_KEYWORD = 'Then ';
Step.AND_STEP_KEYWORD     = 'And ';
Step.BUT_STEP_KEYWORD     = 'But ';
Step.STAR_STEP_KEYWORD    = '* ';
module.exports = Step;

});

require.define("/cucumber/ast/tag",function(require,module,exports,__dirname,__filename,process){var Tag = function(name, uri, line) {
  var Cucumber = require('../../cucumber');

  var self = {
    getName: function getName() {
      return name;
    },

    getUri: function getUri() {
      return uri;
    },

    getLine: function getLine() {
      return line;
    }
  };
  return self;
};
module.exports = Tag;

});

require.define("/node_modules/underscore",function(require,module,exports,__dirname,__filename,process){//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1), true);
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);

});
require("/node_modules/underscore");

require.define("/node_modules/gherkin",function(require,module,exports,__dirname,__filename,process){/**
 * Creates a new Lexer for a specific language.
 */
exports.Lexer = function(lang) {
  return require('./gherkin/lexer/' + lang).Lexer;
};

/**
 * Creates a connect middleware for loading lexer sources (typically for browsers).
 */
exports.connect = function(path) {
  var gherkinFiles = require('connect').static(__dirname);

  return function(req, res, next) {
    if(req.url.indexOf(path) == 0) {
      req.url = req.url.slice(path.length);
      gherkinFiles(req, res, next);
    } else {
      next();
    }
  };
};
});
require("/node_modules/gherkin");

require.define("/cucumber",function(require,module,exports,__dirname,__filename,process){var Cucumber = function(featureSource, supportCodeInitializer, options) {
  var configuration = Cucumber.VolatileConfiguration(featureSource, supportCodeInitializer, options);
  var runtime       = Cucumber.Runtime(configuration);
  return runtime;
};
Cucumber.Ast                   = require('./cucumber/ast');
// browserify won't load ./cucumber/cli and throw an exception:
try { Cucumber.Cli             = require('./cucumber/cli'); } catch(e) {}
Cucumber.Debug                 = require('./cucumber/debug'); // Untested namespace
Cucumber.Listener              = require('./cucumber/listener');
Cucumber.Parser                = require('./cucumber/parser');
Cucumber.Runtime               = require('./cucumber/runtime');
Cucumber.SupportCode           = require('./cucumber/support_code');
Cucumber.TagGroupParser        = require('./cucumber/tag_group_parser');
Cucumber.Type                  = require('./cucumber/type');
Cucumber.Util                  = require('./cucumber/util');
Cucumber.VolatileConfiguration = require('./cucumber/volatile_configuration');

Cucumber.VERSION               = "0.3.0";

module.exports                 = Cucumber;

});
require("/cucumber");

require.define("/node_modules/gherkin/lexer/en",function(require,module,exports,__dirname,__filename,process){
/* line 1 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
;(function() {


/* line 126 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */



/* line 11 "js/lib/gherkin/lexer/en.js" */
var _lexer_actions = [
	0, 1, 0, 1, 1, 1, 2, 1, 
	3, 1, 4, 1, 5, 1, 6, 1, 
	7, 1, 8, 1, 9, 1, 10, 1, 
	11, 1, 12, 1, 13, 1, 16, 1, 
	17, 1, 18, 1, 19, 1, 20, 1, 
	21, 1, 22, 1, 23, 2, 2, 18, 
	2, 3, 4, 2, 13, 0, 2, 14, 
	15, 2, 17, 0, 2, 17, 1, 2, 
	17, 16, 2, 17, 19, 2, 18, 6, 
	2, 18, 7, 2, 18, 8, 2, 18, 
	9, 2, 18, 10, 2, 18, 16, 2, 
	20, 21, 2, 22, 0, 2, 22, 1, 
	2, 22, 16, 2, 22, 19, 3, 4, 
	14, 15, 3, 5, 14, 15, 3, 11, 
	14, 15, 3, 12, 14, 15, 3, 13, 
	14, 15, 3, 14, 15, 18, 3, 17, 
	0, 11, 3, 17, 14, 15, 4, 2, 
	14, 15, 18, 4, 3, 4, 14, 15, 
	4, 17, 0, 14, 15, 5, 17, 0, 
	11, 14, 15
];

var _lexer_key_offsets = [
	0, 0, 19, 37, 38, 39, 41, 43, 
	48, 53, 58, 63, 67, 71, 73, 74, 
	75, 76, 77, 78, 79, 80, 81, 82, 
	83, 84, 85, 86, 87, 88, 89, 91, 
	93, 98, 105, 110, 112, 113, 114, 115, 
	116, 117, 118, 119, 120, 132, 134, 136, 
	138, 140, 142, 144, 146, 148, 150, 152, 
	154, 156, 158, 160, 162, 164, 166, 168, 
	170, 172, 174, 192, 194, 195, 196, 197, 
	198, 199, 200, 201, 202, 203, 204, 205, 
	220, 222, 224, 226, 228, 230, 232, 234, 
	236, 238, 240, 242, 244, 246, 248, 250, 
	253, 255, 257, 259, 261, 263, 265, 267, 
	269, 272, 274, 276, 278, 280, 282, 284, 
	286, 288, 290, 292, 294, 296, 298, 300, 
	302, 304, 306, 308, 310, 312, 314, 316, 
	318, 320, 322, 324, 326, 329, 332, 334, 
	336, 338, 340, 342, 344, 346, 348, 350, 
	352, 354, 356, 358, 359, 360, 361, 362, 
	363, 364, 365, 366, 367, 368, 369, 370, 
	371, 372, 373, 374, 375, 376, 377, 378, 
	387, 389, 391, 393, 395, 397, 399, 401, 
	403, 405, 407, 409, 411, 413, 415, 417, 
	419, 421, 423, 425, 427, 429, 431, 433, 
	435, 437, 438, 439, 440, 441, 442, 443, 
	444, 445, 446, 447, 448, 449, 450, 451, 
	452, 453, 454, 457, 459, 460, 461, 462, 
	463, 464, 465, 466, 467, 468, 483, 485, 
	487, 489, 491, 493, 495, 497, 499, 501, 
	503, 505, 507, 509, 511, 513, 516, 518, 
	520, 522, 524, 526, 528, 530, 532, 535, 
	537, 539, 541, 543, 545, 547, 549, 551, 
	553, 555, 557, 559, 561, 563, 565, 567, 
	569, 571, 573, 575, 577, 579, 581, 583, 
	585, 587, 589, 591, 592, 593, 594, 595, 
	596, 597, 598, 599, 614, 616, 618, 620, 
	622, 624, 626, 628, 630, 632, 634, 636, 
	638, 640, 642, 644, 647, 649, 651, 653, 
	655, 657, 659, 661, 664, 666, 668, 670, 
	672, 674, 676, 678, 680, 683, 685, 687, 
	689, 691, 693, 695, 697, 699, 701, 703, 
	705, 707, 709, 711, 713, 715, 717, 719, 
	721, 723, 725, 727, 729, 731, 733, 735, 
	738, 741, 743, 745, 747, 749, 751, 753, 
	755, 757, 759, 761, 763, 765, 766, 770, 
	776, 779, 781, 787, 805, 808, 810, 812, 
	814, 816, 818, 820, 822, 824, 826, 828, 
	830, 832, 834, 836, 838, 840, 842, 844, 
	846, 848, 850, 852, 854, 856, 858, 860, 
	862, 864, 866, 868, 870, 872, 874, 876, 
	878, 880, 882, 884, 888, 891, 893, 895, 
	897, 899, 901, 903, 905, 907, 909, 911, 
	913, 914, 915, 916
];

var _lexer_trans_keys = [
	10, 32, 34, 35, 37, 42, 64, 65, 
	66, 69, 70, 71, 83, 84, 87, 124, 
	239, 9, 13, 10, 32, 34, 35, 37, 
	42, 64, 65, 66, 69, 70, 71, 83, 
	84, 87, 124, 9, 13, 34, 34, 10, 
	13, 10, 13, 10, 32, 34, 9, 13, 
	10, 32, 34, 9, 13, 10, 32, 34, 
	9, 13, 10, 32, 34, 9, 13, 10, 
	32, 9, 13, 10, 32, 9, 13, 10, 
	13, 10, 95, 70, 69, 65, 84, 85, 
	82, 69, 95, 69, 78, 68, 95, 37, 
	32, 10, 13, 10, 13, 13, 32, 64, 
	9, 10, 9, 10, 13, 32, 64, 11, 
	12, 10, 32, 64, 9, 13, 98, 110, 
	105, 108, 105, 116, 121, 58, 10, 10, 
	10, 32, 35, 37, 64, 65, 66, 69, 
	70, 83, 9, 13, 10, 95, 10, 70, 
	10, 69, 10, 65, 10, 84, 10, 85, 
	10, 82, 10, 69, 10, 95, 10, 69, 
	10, 78, 10, 68, 10, 95, 10, 37, 
	10, 98, 10, 105, 10, 108, 10, 105, 
	10, 116, 10, 121, 10, 58, 10, 32, 
	34, 35, 37, 42, 64, 65, 66, 69, 
	70, 71, 83, 84, 87, 124, 9, 13, 
	97, 117, 99, 107, 103, 114, 111, 117, 
	110, 100, 58, 10, 10, 10, 32, 35, 
	37, 42, 64, 65, 66, 70, 71, 83, 
	84, 87, 9, 13, 10, 95, 10, 70, 
	10, 69, 10, 65, 10, 84, 10, 85, 
	10, 82, 10, 69, 10, 95, 10, 69, 
	10, 78, 10, 68, 10, 95, 10, 37, 
	10, 32, 10, 98, 110, 10, 105, 10, 
	108, 10, 105, 10, 116, 10, 121, 10, 
	58, 10, 100, 10, 117, 10, 115, 116, 
	10, 105, 10, 110, 10, 101, 10, 115, 
	10, 115, 10, 32, 10, 78, 10, 101, 
	10, 101, 10, 100, 10, 101, 10, 97, 
	10, 116, 10, 117, 10, 114, 10, 101, 
	10, 105, 10, 118, 10, 101, 10, 110, 
	10, 99, 10, 101, 10, 110, 10, 97, 
	10, 114, 10, 105, 10, 111, 10, 32, 
	58, 10, 79, 84, 10, 117, 10, 116, 
	10, 108, 10, 105, 10, 110, 10, 101, 
	10, 109, 10, 112, 10, 108, 10, 97, 
	10, 116, 10, 104, 115, 116, 105, 110, 
	101, 115, 115, 32, 78, 101, 101, 100, 
	120, 97, 109, 112, 108, 101, 115, 58, 
	10, 10, 10, 32, 35, 65, 66, 70, 
	124, 9, 13, 10, 98, 10, 105, 10, 
	108, 10, 105, 10, 116, 10, 121, 10, 
	58, 10, 117, 10, 115, 10, 105, 10, 
	110, 10, 101, 10, 115, 10, 115, 10, 
	32, 10, 78, 10, 101, 10, 101, 10, 
	100, 10, 101, 10, 97, 10, 116, 10, 
	117, 10, 114, 10, 101, 101, 97, 116, 
	117, 114, 101, 105, 118, 101, 110, 99, 
	101, 110, 97, 114, 105, 111, 32, 58, 
	115, 79, 84, 117, 116, 108, 105, 110, 
	101, 58, 10, 10, 10, 32, 35, 37, 
	42, 64, 65, 66, 70, 71, 83, 84, 
	87, 9, 13, 10, 95, 10, 70, 10, 
	69, 10, 65, 10, 84, 10, 85, 10, 
	82, 10, 69, 10, 95, 10, 69, 10, 
	78, 10, 68, 10, 95, 10, 37, 10, 
	32, 10, 98, 110, 10, 105, 10, 108, 
	10, 105, 10, 116, 10, 121, 10, 58, 
	10, 100, 10, 117, 10, 115, 116, 10, 
	105, 10, 110, 10, 101, 10, 115, 10, 
	115, 10, 32, 10, 78, 10, 101, 10, 
	101, 10, 100, 10, 101, 10, 97, 10, 
	116, 10, 117, 10, 114, 10, 101, 10, 
	105, 10, 118, 10, 101, 10, 110, 10, 
	99, 10, 101, 10, 110, 10, 97, 10, 
	114, 10, 105, 10, 111, 10, 104, 101, 
	109, 112, 108, 97, 116, 10, 10, 10, 
	32, 35, 37, 42, 64, 65, 66, 70, 
	71, 83, 84, 87, 9, 13, 10, 95, 
	10, 70, 10, 69, 10, 65, 10, 84, 
	10, 85, 10, 82, 10, 69, 10, 95, 
	10, 69, 10, 78, 10, 68, 10, 95, 
	10, 37, 10, 32, 10, 98, 110, 10, 
	105, 10, 108, 10, 105, 10, 116, 10, 
	121, 10, 58, 10, 100, 10, 97, 117, 
	10, 99, 10, 107, 10, 103, 10, 114, 
	10, 111, 10, 117, 10, 110, 10, 100, 
	10, 115, 116, 10, 105, 10, 110, 10, 
	101, 10, 115, 10, 115, 10, 32, 10, 
	78, 10, 101, 10, 101, 10, 101, 10, 
	97, 10, 116, 10, 117, 10, 114, 10, 
	101, 10, 105, 10, 118, 10, 101, 10, 
	110, 10, 99, 10, 101, 10, 110, 10, 
	97, 10, 114, 10, 105, 10, 111, 10, 
	32, 58, 10, 79, 84, 10, 117, 10, 
	116, 10, 108, 10, 105, 10, 110, 10, 
	101, 10, 109, 10, 112, 10, 108, 10, 
	97, 10, 116, 10, 104, 104, 32, 124, 
	9, 13, 10, 32, 92, 124, 9, 13, 
	10, 92, 124, 10, 92, 10, 32, 92, 
	124, 9, 13, 10, 32, 34, 35, 37, 
	42, 64, 65, 66, 69, 70, 71, 83, 
	84, 87, 124, 9, 13, 10, 97, 117, 
	10, 99, 10, 107, 10, 103, 10, 114, 
	10, 111, 10, 117, 10, 110, 10, 100, 
	10, 115, 10, 105, 10, 110, 10, 101, 
	10, 115, 10, 115, 10, 32, 10, 78, 
	10, 101, 10, 101, 10, 120, 10, 97, 
	10, 109, 10, 112, 10, 108, 10, 101, 
	10, 115, 10, 101, 10, 97, 10, 116, 
	10, 117, 10, 114, 10, 101, 10, 99, 
	10, 101, 10, 110, 10, 97, 10, 114, 
	10, 105, 10, 111, 10, 32, 58, 115, 
	10, 79, 84, 10, 117, 10, 116, 10, 
	108, 10, 105, 10, 110, 10, 101, 10, 
	109, 10, 112, 10, 108, 10, 97, 10, 
	116, 100, 187, 191, 0
];

var _lexer_single_lengths = [
	0, 17, 16, 1, 1, 2, 2, 3, 
	3, 3, 3, 2, 2, 2, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 2, 2, 
	3, 5, 3, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 10, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 16, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 13, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 3, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	3, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 3, 3, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 7, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 1, 1, 1, 
	1, 1, 3, 2, 1, 1, 1, 1, 
	1, 1, 1, 1, 1, 13, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 3, 2, 2, 
	2, 2, 2, 2, 2, 2, 3, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 1, 1, 1, 1, 1, 
	1, 1, 1, 13, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 3, 2, 2, 2, 2, 
	2, 2, 2, 3, 2, 2, 2, 2, 
	2, 2, 2, 2, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 3, 
	3, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 1, 2, 4, 
	3, 2, 4, 16, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	2, 2, 2, 4, 3, 2, 2, 2, 
	2, 2, 2, 2, 2, 2, 2, 2, 
	1, 1, 1, 0
];

var _lexer_range_lengths = [
	0, 1, 1, 0, 0, 0, 0, 1, 
	1, 1, 1, 1, 1, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	1, 1, 1, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 1, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 1, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 1, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 1, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 1, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 1, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 1, 1, 
	0, 0, 1, 1, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0
];

var _lexer_index_offsets = [
	0, 0, 19, 37, 39, 41, 44, 47, 
	52, 57, 62, 67, 71, 75, 78, 80, 
	82, 84, 86, 88, 90, 92, 94, 96, 
	98, 100, 102, 104, 106, 108, 110, 113, 
	116, 121, 128, 133, 136, 138, 140, 142, 
	144, 146, 148, 150, 152, 164, 167, 170, 
	173, 176, 179, 182, 185, 188, 191, 194, 
	197, 200, 203, 206, 209, 212, 215, 218, 
	221, 224, 227, 245, 248, 250, 252, 254, 
	256, 258, 260, 262, 264, 266, 268, 270, 
	285, 288, 291, 294, 297, 300, 303, 306, 
	309, 312, 315, 318, 321, 324, 327, 330, 
	334, 337, 340, 343, 346, 349, 352, 355, 
	358, 362, 365, 368, 371, 374, 377, 380, 
	383, 386, 389, 392, 395, 398, 401, 404, 
	407, 410, 413, 416, 419, 422, 425, 428, 
	431, 434, 437, 440, 443, 447, 451, 454, 
	457, 460, 463, 466, 469, 472, 475, 478, 
	481, 484, 487, 490, 492, 494, 496, 498, 
	500, 502, 504, 506, 508, 510, 512, 514, 
	516, 518, 520, 522, 524, 526, 528, 530, 
	539, 542, 545, 548, 551, 554, 557, 560, 
	563, 566, 569, 572, 575, 578, 581, 584, 
	587, 590, 593, 596, 599, 602, 605, 608, 
	611, 614, 616, 618, 620, 622, 624, 626, 
	628, 630, 632, 634, 636, 638, 640, 642, 
	644, 646, 648, 652, 655, 657, 659, 661, 
	663, 665, 667, 669, 671, 673, 688, 691, 
	694, 697, 700, 703, 706, 709, 712, 715, 
	718, 721, 724, 727, 730, 733, 737, 740, 
	743, 746, 749, 752, 755, 758, 761, 765, 
	768, 771, 774, 777, 780, 783, 786, 789, 
	792, 795, 798, 801, 804, 807, 810, 813, 
	816, 819, 822, 825, 828, 831, 834, 837, 
	840, 843, 846, 849, 851, 853, 855, 857, 
	859, 861, 863, 865, 880, 883, 886, 889, 
	892, 895, 898, 901, 904, 907, 910, 913, 
	916, 919, 922, 925, 929, 932, 935, 938, 
	941, 944, 947, 950, 954, 957, 960, 963, 
	966, 969, 972, 975, 978, 982, 985, 988, 
	991, 994, 997, 1000, 1003, 1006, 1009, 1012, 
	1015, 1018, 1021, 1024, 1027, 1030, 1033, 1036, 
	1039, 1042, 1045, 1048, 1051, 1054, 1057, 1060, 
	1064, 1068, 1071, 1074, 1077, 1080, 1083, 1086, 
	1089, 1092, 1095, 1098, 1101, 1104, 1106, 1110, 
	1116, 1120, 1123, 1129, 1147, 1151, 1154, 1157, 
	1160, 1163, 1166, 1169, 1172, 1175, 1178, 1181, 
	1184, 1187, 1190, 1193, 1196, 1199, 1202, 1205, 
	1208, 1211, 1214, 1217, 1220, 1223, 1226, 1229, 
	1232, 1235, 1238, 1241, 1244, 1247, 1250, 1253, 
	1256, 1259, 1262, 1265, 1270, 1274, 1277, 1280, 
	1283, 1286, 1289, 1292, 1295, 1298, 1301, 1304, 
	1307, 1309, 1311, 1313
];

var _lexer_indicies = [
	2, 1, 3, 4, 5, 6, 7, 8, 
	9, 10, 11, 12, 13, 14, 14, 15, 
	16, 1, 0, 2, 1, 3, 4, 5, 
	6, 7, 8, 9, 10, 11, 12, 13, 
	14, 14, 15, 1, 0, 17, 0, 18, 
	0, 20, 21, 19, 23, 24, 22, 27, 
	26, 28, 26, 25, 31, 30, 32, 30, 
	29, 31, 30, 33, 30, 29, 31, 30, 
	34, 30, 29, 36, 35, 35, 0, 2, 
	37, 37, 0, 39, 40, 38, 2, 0, 
	41, 0, 42, 0, 43, 0, 44, 0, 
	45, 0, 46, 0, 47, 0, 48, 0, 
	49, 0, 50, 0, 51, 0, 52, 0, 
	53, 0, 54, 0, 55, 0, 57, 58, 
	56, 60, 61, 59, 0, 0, 0, 0, 
	62, 63, 64, 63, 63, 66, 65, 62, 
	2, 67, 7, 67, 0, 68, 69, 0, 
	70, 0, 71, 0, 72, 0, 73, 0, 
	74, 0, 75, 0, 77, 76, 79, 78, 
	79, 80, 81, 82, 81, 83, 84, 85, 
	86, 87, 80, 78, 79, 88, 78, 79, 
	89, 78, 79, 90, 78, 79, 91, 78, 
	79, 92, 78, 79, 93, 78, 79, 94, 
	78, 79, 95, 78, 79, 96, 78, 79, 
	97, 78, 79, 98, 78, 79, 99, 78, 
	79, 100, 78, 79, 101, 78, 79, 102, 
	78, 79, 103, 78, 79, 104, 78, 79, 
	105, 78, 79, 106, 78, 79, 107, 78, 
	79, 108, 78, 110, 109, 111, 112, 113, 
	114, 115, 116, 117, 118, 119, 120, 121, 
	122, 122, 123, 109, 0, 124, 125, 0, 
	126, 0, 127, 0, 128, 0, 129, 0, 
	130, 0, 131, 0, 132, 0, 133, 0, 
	134, 0, 136, 135, 138, 137, 138, 139, 
	140, 141, 142, 140, 143, 144, 145, 146, 
	147, 148, 148, 139, 137, 138, 149, 137, 
	138, 150, 137, 138, 151, 137, 138, 152, 
	137, 138, 153, 137, 138, 154, 137, 138, 
	155, 137, 138, 156, 137, 138, 157, 137, 
	138, 158, 137, 138, 159, 137, 138, 160, 
	137, 138, 161, 137, 138, 162, 137, 138, 
	163, 137, 138, 164, 165, 137, 138, 166, 
	137, 138, 167, 137, 138, 168, 137, 138, 
	169, 137, 138, 170, 137, 138, 163, 137, 
	138, 171, 137, 138, 172, 137, 138, 173, 
	171, 137, 138, 174, 137, 138, 175, 137, 
	138, 176, 137, 138, 177, 137, 138, 178, 
	137, 138, 179, 137, 138, 180, 137, 138, 
	181, 137, 138, 182, 137, 138, 170, 137, 
	138, 183, 137, 138, 184, 137, 138, 185, 
	137, 138, 186, 137, 138, 187, 137, 138, 
	170, 137, 138, 188, 137, 138, 189, 137, 
	138, 190, 137, 138, 171, 137, 138, 191, 
	137, 138, 192, 137, 138, 193, 137, 138, 
	194, 137, 138, 195, 137, 138, 196, 137, 
	138, 197, 137, 138, 198, 163, 137, 138, 
	199, 200, 137, 138, 201, 137, 138, 202, 
	137, 138, 203, 137, 138, 204, 137, 138, 
	187, 137, 138, 205, 137, 138, 206, 137, 
	138, 207, 137, 138, 208, 137, 138, 209, 
	137, 138, 187, 137, 138, 189, 137, 210, 
	211, 0, 212, 0, 213, 0, 214, 0, 
	215, 0, 216, 0, 217, 0, 218, 0, 
	219, 0, 220, 0, 74, 0, 221, 0, 
	222, 0, 223, 0, 224, 0, 225, 0, 
	226, 0, 227, 0, 228, 0, 230, 229, 
	232, 231, 232, 233, 234, 235, 236, 237, 
	234, 233, 231, 232, 238, 231, 232, 239, 
	231, 232, 240, 231, 232, 241, 231, 232, 
	242, 231, 232, 243, 231, 232, 244, 231, 
	232, 245, 231, 232, 246, 231, 232, 247, 
	231, 232, 248, 231, 232, 249, 231, 232, 
	250, 231, 232, 251, 231, 232, 252, 231, 
	232, 253, 231, 232, 254, 231, 232, 255, 
	231, 232, 243, 231, 232, 256, 231, 232, 
	257, 231, 232, 258, 231, 232, 259, 231, 
	232, 260, 231, 232, 243, 231, 261, 0, 
	262, 0, 263, 0, 264, 0, 265, 0, 
	74, 0, 266, 0, 267, 0, 268, 0, 
	211, 0, 269, 0, 270, 0, 271, 0, 
	272, 0, 273, 0, 274, 0, 275, 0, 
	276, 277, 227, 0, 278, 279, 0, 280, 
	0, 281, 0, 282, 0, 283, 0, 284, 
	0, 285, 0, 286, 0, 288, 287, 290, 
	289, 290, 291, 292, 293, 294, 292, 295, 
	296, 297, 298, 299, 300, 300, 291, 289, 
	290, 301, 289, 290, 302, 289, 290, 303, 
	289, 290, 304, 289, 290, 305, 289, 290, 
	306, 289, 290, 307, 289, 290, 308, 289, 
	290, 309, 289, 290, 310, 289, 290, 311, 
	289, 290, 312, 289, 290, 313, 289, 290, 
	314, 289, 290, 315, 289, 290, 316, 317, 
	289, 290, 318, 289, 290, 319, 289, 290, 
	320, 289, 290, 321, 289, 290, 322, 289, 
	290, 315, 289, 290, 323, 289, 290, 324, 
	289, 290, 325, 323, 289, 290, 326, 289, 
	290, 327, 289, 290, 328, 289, 290, 329, 
	289, 290, 330, 289, 290, 331, 289, 290, 
	332, 289, 290, 333, 289, 290, 334, 289, 
	290, 322, 289, 290, 335, 289, 290, 336, 
	289, 290, 337, 289, 290, 338, 289, 290, 
	339, 289, 290, 322, 289, 290, 340, 289, 
	290, 341, 289, 290, 342, 289, 290, 323, 
	289, 290, 343, 289, 290, 344, 289, 290, 
	345, 289, 290, 346, 289, 290, 347, 289, 
	290, 348, 289, 290, 322, 289, 290, 341, 
	289, 349, 0, 350, 0, 351, 0, 352, 
	0, 353, 0, 284, 0, 355, 354, 357, 
	356, 357, 358, 359, 360, 361, 359, 362, 
	363, 364, 365, 366, 367, 367, 358, 356, 
	357, 368, 356, 357, 369, 356, 357, 370, 
	356, 357, 371, 356, 357, 372, 356, 357, 
	373, 356, 357, 374, 356, 357, 375, 356, 
	357, 376, 356, 357, 377, 356, 357, 378, 
	356, 357, 379, 356, 357, 380, 356, 357, 
	381, 356, 357, 382, 356, 357, 383, 384, 
	356, 357, 385, 356, 357, 386, 356, 357, 
	387, 356, 357, 388, 356, 357, 389, 356, 
	357, 382, 356, 357, 390, 356, 357, 391, 
	392, 356, 357, 393, 356, 357, 394, 356, 
	357, 395, 356, 357, 396, 356, 357, 397, 
	356, 357, 398, 356, 357, 399, 356, 357, 
	389, 356, 357, 400, 390, 356, 357, 401, 
	356, 357, 402, 356, 357, 403, 356, 357, 
	404, 356, 357, 405, 356, 357, 406, 356, 
	357, 407, 356, 357, 408, 356, 357, 399, 
	356, 357, 409, 356, 357, 410, 356, 357, 
	411, 356, 357, 412, 356, 357, 413, 356, 
	357, 389, 356, 357, 414, 356, 357, 415, 
	356, 357, 416, 356, 357, 390, 356, 357, 
	417, 356, 357, 418, 356, 357, 419, 356, 
	357, 420, 356, 357, 421, 356, 357, 422, 
	356, 357, 423, 356, 357, 424, 382, 356, 
	357, 425, 426, 356, 357, 427, 356, 357, 
	428, 356, 357, 429, 356, 357, 430, 356, 
	357, 413, 356, 357, 431, 356, 357, 432, 
	356, 357, 433, 356, 357, 434, 356, 357, 
	435, 356, 357, 413, 356, 357, 415, 356, 
	267, 0, 436, 437, 436, 0, 440, 439, 
	441, 442, 439, 438, 0, 444, 445, 443, 
	0, 444, 443, 440, 446, 444, 445, 446, 
	443, 440, 447, 448, 449, 450, 451, 452, 
	453, 454, 455, 456, 457, 458, 459, 459, 
	460, 447, 0, 79, 461, 462, 78, 79, 
	463, 78, 79, 464, 78, 79, 465, 78, 
	79, 466, 78, 79, 467, 78, 79, 468, 
	78, 79, 469, 78, 79, 107, 78, 79, 
	470, 78, 79, 471, 78, 79, 472, 78, 
	79, 473, 78, 79, 474, 78, 79, 475, 
	78, 79, 476, 78, 79, 477, 78, 79, 
	478, 78, 79, 469, 78, 79, 479, 78, 
	79, 480, 78, 79, 481, 78, 79, 482, 
	78, 79, 483, 78, 79, 484, 78, 79, 
	107, 78, 79, 485, 78, 79, 486, 78, 
	79, 487, 78, 79, 488, 78, 79, 489, 
	78, 79, 107, 78, 79, 490, 78, 79, 
	491, 78, 79, 492, 78, 79, 493, 78, 
	79, 494, 78, 79, 495, 78, 79, 496, 
	78, 79, 497, 108, 107, 78, 79, 498, 
	499, 78, 79, 500, 78, 79, 501, 78, 
	79, 502, 78, 79, 503, 78, 79, 489, 
	78, 79, 504, 78, 79, 505, 78, 79, 
	506, 78, 79, 507, 78, 79, 508, 78, 
	79, 489, 78, 211, 0, 509, 0, 1, 
	0, 510, 0
];

var _lexer_trans_targs = [
	0, 2, 2, 3, 13, 15, 29, 32, 
	35, 67, 157, 193, 199, 203, 357, 358, 
	417, 4, 5, 6, 7, 6, 6, 7, 
	6, 8, 8, 8, 9, 8, 8, 8, 
	9, 10, 11, 12, 2, 12, 13, 2, 
	14, 16, 17, 18, 19, 20, 21, 22, 
	23, 24, 25, 26, 27, 28, 419, 30, 
	31, 2, 14, 31, 2, 14, 33, 34, 
	2, 33, 32, 34, 36, 416, 37, 38, 
	39, 40, 41, 42, 43, 44, 43, 44, 
	44, 2, 45, 59, 364, 383, 390, 396, 
	46, 47, 48, 49, 50, 51, 52, 53, 
	54, 55, 56, 57, 58, 2, 60, 61, 
	62, 63, 64, 65, 66, 2, 2, 3, 
	13, 15, 29, 32, 35, 67, 157, 193, 
	199, 203, 357, 358, 68, 146, 69, 70, 
	71, 72, 73, 74, 75, 76, 77, 78, 
	79, 78, 79, 79, 2, 80, 94, 95, 
	103, 115, 121, 125, 145, 81, 82, 83, 
	84, 85, 86, 87, 88, 89, 90, 91, 
	92, 93, 2, 66, 96, 102, 97, 98, 
	99, 100, 101, 94, 104, 105, 106, 107, 
	108, 109, 110, 111, 112, 113, 114, 116, 
	117, 118, 119, 120, 122, 123, 124, 126, 
	127, 128, 129, 130, 131, 132, 133, 134, 
	139, 135, 136, 137, 138, 140, 141, 142, 
	143, 144, 147, 29, 148, 149, 150, 151, 
	152, 153, 154, 155, 156, 158, 159, 160, 
	161, 162, 163, 164, 165, 166, 167, 166, 
	167, 167, 2, 168, 175, 187, 169, 170, 
	171, 172, 173, 174, 66, 176, 177, 178, 
	179, 180, 181, 182, 183, 184, 185, 186, 
	188, 189, 190, 191, 192, 194, 195, 196, 
	197, 198, 200, 201, 202, 204, 205, 206, 
	207, 208, 209, 210, 211, 281, 212, 275, 
	213, 214, 215, 216, 217, 218, 219, 220, 
	221, 220, 221, 221, 2, 222, 236, 237, 
	245, 257, 263, 267, 274, 223, 224, 225, 
	226, 227, 228, 229, 230, 231, 232, 233, 
	234, 235, 2, 66, 238, 244, 239, 240, 
	241, 242, 243, 236, 246, 247, 248, 249, 
	250, 251, 252, 253, 254, 255, 256, 258, 
	259, 260, 261, 262, 264, 265, 266, 268, 
	269, 270, 271, 272, 273, 276, 277, 278, 
	279, 280, 282, 283, 282, 283, 283, 2, 
	284, 298, 299, 307, 326, 332, 336, 356, 
	285, 286, 287, 288, 289, 290, 291, 292, 
	293, 294, 295, 296, 297, 2, 66, 300, 
	306, 301, 302, 303, 304, 305, 298, 308, 
	316, 309, 310, 311, 312, 313, 314, 315, 
	317, 318, 319, 320, 321, 322, 323, 324, 
	325, 327, 328, 329, 330, 331, 333, 334, 
	335, 337, 338, 339, 340, 341, 342, 343, 
	344, 345, 350, 346, 347, 348, 349, 351, 
	352, 353, 354, 355, 358, 359, 360, 362, 
	363, 361, 359, 360, 361, 359, 362, 363, 
	3, 13, 15, 29, 32, 35, 67, 157, 
	193, 199, 203, 357, 358, 365, 373, 366, 
	367, 368, 369, 370, 371, 372, 374, 375, 
	376, 377, 378, 379, 380, 381, 382, 384, 
	385, 386, 387, 388, 389, 391, 392, 393, 
	394, 395, 397, 398, 399, 400, 401, 402, 
	403, 404, 405, 410, 406, 407, 408, 409, 
	411, 412, 413, 414, 415, 418, 0
];

var _lexer_trans_actions = [
	43, 0, 54, 3, 1, 0, 29, 1, 
	29, 29, 29, 29, 29, 29, 29, 35, 
	0, 0, 0, 7, 139, 48, 0, 102, 
	9, 5, 45, 134, 45, 0, 33, 122, 
	33, 33, 0, 11, 106, 0, 0, 114, 
	25, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	57, 149, 126, 0, 110, 23, 0, 27, 
	118, 27, 51, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 57, 144, 0, 54, 
	0, 69, 33, 84, 84, 84, 84, 84, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 13, 0, 0, 
	0, 0, 0, 0, 13, 31, 130, 60, 
	57, 31, 63, 57, 63, 63, 63, 63, 
	63, 63, 63, 66, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 57, 
	144, 0, 54, 0, 72, 33, 84, 84, 
	84, 84, 84, 84, 84, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 15, 15, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 57, 144, 0, 
	54, 0, 81, 84, 84, 84, 0, 0, 
	0, 0, 0, 0, 21, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 57, 
	144, 0, 54, 0, 78, 33, 84, 84, 
	84, 84, 84, 84, 84, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 19, 19, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 57, 144, 0, 54, 0, 75, 
	33, 84, 84, 84, 84, 84, 84, 84, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 17, 17, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 37, 37, 
	54, 37, 87, 0, 0, 39, 0, 0, 
	93, 90, 41, 96, 90, 96, 96, 96, 
	96, 96, 96, 96, 99, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0, 0, 
	0, 0, 0, 0, 0, 0, 0
];

var _lexer_eof_actions = [
	0, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43, 43, 43, 43, 43, 
	43, 43, 43, 43
];

var lexer_start = 1;
var lexer_first_final = 419;
var lexer_error = 0;

var lexer_en_main = 1;


/* line 129 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

/* line 130 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

/* line 131 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

var Lexer = function(listener) {
  // Check that listener has the required functions
  var events = ['comment', 'tag', 'feature', 'background', 'scenario', 'scenario_outline', 'examples', 'step', 'doc_string', 'row', 'eof'];
  for(e in events) {
    var event = events[e];
    if(typeof listener[event] != 'function') {
      throw "Error. No " + event + " function exists on " + JSON.stringify(listener);
    }
  }
  this.listener = listener;
};

Lexer.prototype.scan = function(data) {
  var ending = "\n%_FEATURE_END_%";
  if(typeof data == 'string') {
    data = this.stringToBytes(data + ending);
  } else if(typeof Buffer != 'undefined' && Buffer.isBuffer(data)) {
    // Node.js
    var buf = new Buffer(data.length + ending.length);
    data.copy(buf, 0, 0);
    new Buffer(ending).copy(buf, data.length, 0);
    data = buf;
  }
  var eof = pe = data.length;
  var p = 0;

  this.line_number = 1;
  this.last_newline = 0;

  
/* line 778 "js/lib/gherkin/lexer/en.js" */
{
	  this.cs = lexer_start;
} /* JSCodeGen::writeInit */

/* line 162 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
  
/* line 785 "js/lib/gherkin/lexer/en.js" */
{
	var _klen, _trans, _keys, _ps, _widec, _acts, _nacts;
	var _goto_level, _resume, _eof_trans, _again, _test_eof;
	var _out;
	_klen = _trans = _keys = _acts = _nacts = null;
	_goto_level = 0;
	_resume = 10;
	_eof_trans = 15;
	_again = 20;
	_test_eof = 30;
	_out = 40;
	while (true) {
	_trigger_goto = false;
	if (_goto_level <= 0) {
	if (p == pe) {
		_goto_level = _test_eof;
		continue;
	}
	if ( this.cs == 0) {
		_goto_level = _out;
		continue;
	}
	}
	if (_goto_level <= _resume) {
	_keys = _lexer_key_offsets[ this.cs];
	_trans = _lexer_index_offsets[ this.cs];
	_klen = _lexer_single_lengths[ this.cs];
	_break_match = false;
	
	do {
	  if (_klen > 0) {
	     _lower = _keys;
	     _upper = _keys + _klen - 1;

	     while (true) {
	        if (_upper < _lower) { break; }
	        _mid = _lower + ( (_upper - _lower) >> 1 );

	        if ( data[p] < _lexer_trans_keys[_mid]) {
	           _upper = _mid - 1;
	        } else if ( data[p] > _lexer_trans_keys[_mid]) {
	           _lower = _mid + 1;
	        } else {
	           _trans += (_mid - _keys);
	           _break_match = true;
	           break;
	        };
	     } /* while */
	     if (_break_match) { break; }
	     _keys += _klen;
	     _trans += _klen;
	  }
	  _klen = _lexer_range_lengths[ this.cs];
	  if (_klen > 0) {
	     _lower = _keys;
	     _upper = _keys + (_klen << 1) - 2;
	     while (true) {
	        if (_upper < _lower) { break; }
	        _mid = _lower + (((_upper-_lower) >> 1) & ~1);
	        if ( data[p] < _lexer_trans_keys[_mid]) {
	          _upper = _mid - 2;
	         } else if ( data[p] > _lexer_trans_keys[_mid+1]) {
	          _lower = _mid + 2;
	        } else {
	          _trans += ((_mid - _keys) >> 1);
	          _break_match = true;
	          break;
	        }
	     } /* while */
	     if (_break_match) { break; }
	     _trans += _klen
	  }
	} while (false);
	_trans = _lexer_indicies[_trans];
	 this.cs = _lexer_trans_targs[_trans];
	if (_lexer_trans_actions[_trans] != 0) {
		_acts = _lexer_trans_actions[_trans];
		_nacts = _lexer_actions[_acts];
		_acts += 1;
		while (_nacts > 0) {
			_nacts -= 1;
			_acts += 1;
			switch (_lexer_actions[_acts - 1]) {
case 0:
/* line 6 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
    this.current_line = this.line_number;
    this.start_col = p - this.last_newline - (this.keyword+':').length;
  		break;
case 1:
/* line 12 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.current_line = this.line_number;
    this.start_col = p - this.last_newline;
  		break;
case 2:
/* line 17 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
  		break;
case 3:
/* line 21 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.docstring_content_type_start = p;
  		break;
case 4:
/* line 25 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.docstring_content_type_end = p;
  		break;
case 5:
/* line 29 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.unindent(
      this.start_col, 
      this.bytesToString(data.slice(this.content_start, this.next_keyword_start-1)).replace(/(\r?\n)?([\t ])*$/, '').replace(/\\\"\\\"\\\"/mg, '"""')
    );
    var con_type = this.bytesToString(data.slice(this.docstring_content_type_start, this.docstring_content_type_end)).trim();
    this.listener.doc_string(con_type, con, this.current_line); 
  		break;
case 6:
/* line 38 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('feature', data, p, eof);
  		break;
case 7:
/* line 42 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('background', data, p, eof);
  		break;
case 8:
/* line 46 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('scenario', data, p, eof);
  		break;
case 9:
/* line 50 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('scenario_outline', data, p, eof);
  		break;
case 10:
/* line 54 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = this.store_keyword_content('examples', data, p, eof);
  		break;
case 11:
/* line 58 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.step(this.keyword, con, this.current_line);
  		break;
case 12:
/* line 63 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.comment(con, this.line_number);
    this.keyword_start = null;
  		break;
case 13:
/* line 69 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    this.listener.tag(con, this.line_number);
    this.keyword_start = null;
  		break;
case 14:
/* line 75 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.line_number++;
  		break;
case 15:
/* line 79 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.last_newline = p + 1;
  		break;
case 16:
/* line 83 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.keyword_start = this.keyword_start || p;
  		break;
case 17:
/* line 87 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.keyword = this.bytesToString(data.slice(this.keyword_start, p)).replace(/:$/, '');
    this.keyword_start = null;
  		break;
case 18:
/* line 92 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.next_keyword_start = p;
  		break;
case 19:
/* line 96 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    p = p - 1;
    current_row = [];
    this.current_line = this.line_number;
  		break;
case 20:
/* line 102 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.content_start = p;
  		break;
case 21:
/* line 106 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    var con = this.bytesToString(data.slice(this.content_start, p)).trim();
    current_row.push(con.replace(/\\\|/, "|").replace(/\\n/, "\n").replace(/\\\\/, "\\"));
  		break;
case 22:
/* line 111 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    this.listener.row(current_row, this.current_line);
  		break;
case 23:
/* line 115 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    if(this.cs < lexer_first_final) {
      var content = this.current_line_content(data, p);
      throw "Lexing error on line " + this.line_number + ": '" + content + "'. See http://wiki.github.com/cucumber/gherkin/lexingerror for more information.";
    } else {
      this.listener.eof();
    }
    
  		break;
/* line 1012 "js/lib/gherkin/lexer/en.js" */
			} /* action switch */
		}
	}
	if (_trigger_goto) {
		continue;
	}
	}
	if (_goto_level <= _again) {
	if ( this.cs == 0) {
		_goto_level = _out;
		continue;
	}
	p += 1;
	if (p != pe) {
		_goto_level = _resume;
		continue;
	}
	}
	if (_goto_level <= _test_eof) {
	if (p == eof) {
	__acts = _lexer_eof_actions[ this.cs];
	__nacts =  _lexer_actions[__acts];
	__acts += 1;
	while (__nacts > 0) {
		__nacts -= 1;
		__acts += 1;
		switch (_lexer_actions[__acts - 1]) {
case 23:
/* line 115 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */

    if(this.cs < lexer_first_final) {
      var content = this.current_line_content(data, p);
      throw "Lexing error on line " + this.line_number + ": '" + content + "'. See http://wiki.github.com/cucumber/gherkin/lexingerror for more information.";
    } else {
      this.listener.eof();
    }
    
  		break;
/* line 1051 "js/lib/gherkin/lexer/en.js" */
		} /* eof action switch */
	}
	if (_trigger_goto) {
		continue;
	}
}
	}
	if (_goto_level <= _out) {
		break;
	}
	}
	}

/* line 163 "/Users/ahellesoy/github/gherkin/tasks/../ragel/i18n/en.js.rl" */
};

Lexer.prototype.bytesToString = function(bytes) {
  if(typeof bytes.write == 'function') {
    // Node.js
    return bytes.toString('utf-8');
  } else {
    var result = "";
    for(var b in bytes) {
      result += String.fromCharCode(bytes[b]);
    }
    return result;
  }
};

Lexer.prototype.stringToBytes = function(string) {
  var bytes = [];
  for(var i = 0; i < string.length; i++) {
    bytes[i] = string.charCodeAt(i);
  }
  return bytes;
};

Lexer.prototype.unindent = function(startcol, text) {
  startcol = startcol || 0;
  return text.replace(new RegExp('^[\t ]{0,' + startcol + '}', 'gm'), ''); 
};

Lexer.prototype.store_keyword_content = function(event, data, p, eof) {
  var end_point = (!this.next_keyword_start || (p == eof)) ? p : this.next_keyword_start;
  var content = this.unindent(this.start_col + 2, this.bytesToString(data.slice(this.content_start, end_point))).replace(/\s+$/,"");
  var content_lines = content.split("\n")
  var name = content_lines.shift() || "";
  name = name.trim();
  var description = content_lines.join("\n");
  this.listener[event](this.keyword, name, description, this.current_line);
  var nks = this.next_keyword_start;
  this.next_keyword_start = null;
  return nks ? nks - 1 : p;
};

Lexer.prototype.current_line_content = function(data, p) {
  var rest = data.slice(this.last_newline, -1);
  var end = rest.indexOf(10) || -1;
  return this.bytesToString(rest.slice(0, end)).trim();
};

// Node.js export
if(typeof module !== 'undefined') {
  module.exports = Lexer;
}
// Require.js export
if (typeof define !== 'undefined') {
  if(define.amd) {
    define('gherkin/lexer/en', [], function() {
      return Lexer
    });
  } else {
    define('gherkin/lexer/en', function(require, exports, module) {
      exports.Lexer = Lexer;
    });
  }
}

})();

});
require("/node_modules/gherkin/lexer/en");

context.Cucumber = require('/cucumber');
context.CucumberHTML = require('cucumber-html/src/main/resources/cucumber/formatter/formatter');
})(window);})();
