/// <reference path="chutzpahRunner.js" />
/*globals phantom, chutzpah, window, jasmine*/

(function () {
    'use strict';

    phantom.injectJs('chutzpahRunner.js');
    phantom.injectJs('cucumberReporter.js');

    var self = {};

    function onInitialized() { }

    function onPageLoaded() {
        var _cachedWindowLoad = window.onload;
        window.onload = function () {
            if (_cachedWindowLoad) {
                _cachedWindowLoad();
            }

            console.log("Starting cucumber");
            console.log(self.cucumber);
            self.cucumber.attachListener(new ChutzpahCucumberReporter());
            self.cucumber.start(function () { });
        };
    }

    // Find and concatenate feature definitions in <script> tags
    function concatFeatureDefinitions() {
        
    }

    
    function createStepDefinitionWrapper() {
        

        return 
    }

    function isCucumberLoaded() {
        return typeof window.Cucumber != "undefined";
    }

    function onCucumberLoaded() {
        var featureDefinitions = "";
        console.log(document.getElementById("feature"));
        var scripts = Array.prototype.slice.call(document.scripts);
        console.log("Found " + scripts.length + " scripts");
        scripts.forEach(function (script) {
            console.log("Found script of type " + script.type);
            if (script.type == "text/x-gherkin") {
                console.log("Found feature definition");
                featureDefinitions += script.innerHTML;
            }
        });

        // Search for all methods ending with Steps or Hooks and bundle them for Cucumber
        var stepFunctions = [];
        for (var key in window) {
            if (typeof window[key] == "function" && /[Steps|Hooks]$/.test(key)) {
                console.log("Found step definition");
                stepFunctions.push(window[key]);
            }
        }
        var stepDefinitionFunction = function () {
            for (var ii = 0; ii < stepFunctions.length; ii++) {
                stepFunctions[ii].call(this);
            }
        };

        console.log("Creating cucumber");
        self.cucumber = new window.Cucumber(featureDefinitions, stepDefinitionFunction);
    }

    function isTestingDone() {
        return window.chutzpah.isTestingFinished === true;
    }

    try {
        chutzpah.runner(onInitialized, onPageLoaded, isCucumberLoaded, onCucumberLoaded, isTestingDone);
    } catch (e) {
        phantom.exit(2); // Unknown error
    }
}());
