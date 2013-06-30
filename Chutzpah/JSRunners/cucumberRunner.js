/// <reference path="chutzpahRunner.js" />
/*globals phantom, chutzpah, window, jasmine*/

(function () {
    'use strict';

    phantom.injectJs('chutzpahRunner.js');

    function onInitialized() {
        function buildFeatureDefinitions() {
            var featureDefinitions = "";
            var scripts = Array.prototype.slice.call(document.scripts);
            scripts.forEach(function (script) {
                if (script.type == "text/x-feature") {
                    featureDefinitions += script.innerHTML;
                }
            });

            if (featureDefinitions.length == 0) {
                throw "No feature definitions could be found. " +
                      "Feature definitions should be added to the test HTML " +
                      "as <script type='text/x-feature'>Feature: ...</script> blocks";
            }

            return featureDefinitions;
        }

        function buildStepDefinitionFunction() {
            // Search for all methods ending with Steps or Hooks and bundle them for Cucumber
            var stepFunctions = [];
            for (var key in window) {
                if (typeof window[key] == "function" && /(Steps|Hooks)$/.test(key)) {
                    stepFunctions.push(window[key]);
                }
            }
            if (stepFunctions.length == 0) {
                throw "No step definitions could be found. " +
                      "Step definitions should be defined in global functions ending " +
                      "in either 'Steps' or 'Hooks' (e.g. window.TestSteps)";
            }

            return function stepDefinitionFunction() {
                for (var ii = 0; ii < stepFunctions.length; ii++) {
                    stepFunctions[ii].call(this);
                }
            };
        }

        var ChutzpahCucumberReporter = function () {
            function log(obj) {
                console.log(JSON.stringify(obj));
            }

            var currentFeatureName;

            var featureSetStateTime;
            var scenarioStartTime;

            var totalScenarios = 0;
            var totalScenariosFailed = 0;

            var scenarioCurrentState;

            return {
                hear: function (event, callback) {
                    var eventName = event.getName();

                    switch (eventName) {
                        case 'BeforeFeatures':
                            log({ type: 'FileStart' });
                            featureSetStartTime = new Date().getTime();
                            break;

                        case 'BeforeFeature':
                            currentFeatureName = event.getPayloadItem('feature').getName();
                            break;

                        case 'BeforeScenario':
                            log({ type: "TestStart", testCase: { 
                                moduleName: currentFeatureName,
                                testName: event.getPayloadItem('scenario').getName(),
                                testResults: []
                            }});

                            scenarioStartTime = new Date().getTime();
                            scenarioCurrentState = {
                                passed: true,
                                message: "",
                                stacktrace: null
                            };
                            break;

                        case 'StepResult':
                            var stepResult = event.getPayloadItem('stepResult');
                            var stepName = stepResult.getStep().getName();

                            if (scenarioCurrentState.passed) {
                                if (!stepResult.isSuccessful()) {
                                    scenarioCurrentState.passed = false;
                                    if (stepResult.isFailed()) {
                                        scenarioCurrentState.passed = false;

                                        var error = stepResult.getFailureException();
                                        scenarioCurrentState.message = error.message || error;
                                        scenarioCurrentState.stacktrace = error.stack;
                                    } else if (stepResult.isPending()) {
                                        scenarioCurrentState.message = "Scenario result is pending" +
                                                                       "(probably due to a missing step definition)";
                                    } else if (stepResult.isUndefined()) {
                                        scenarioCurrentState.message = "Scenario result was undefined";
                                    }
                                }
                            }

                            break;

                        case 'AfterScenario':
                            scenarioCurrentState.timeTaken = new Date().getTime() - scenarioStartTime;

                            totalScenarios += 1;
                            if (!scenarioCurrentState.passed) {
                                totalScenariosFailed += 1;
                            }

                            log({
                                type: "TestDone", testCase: {
                                    moduleName: currentFeatureName,
                                    testName: event.getPayloadItem('scenario').getName(),
                                    testResults: [scenarioCurrentState]
                                }
                            });
                            break;

                        case 'AfterFeatures':
                            log({
                                type: 'FileDone',
                                timeTaken: new Date().getTime() - featureSetStartTime,
                                passed: totalScenarios - totalScenariosFailed,
                                failed: totalScenariosFailed
                            });
                            break;
                    }
                    callback();
                }
            };
        };

        var _cachedWindowLoad = window.onload;
        window.onload = function () {
            if (_cachedWindowLoad) {
                _cachedWindowLoad();
            }

            var cucumber = new window.Cucumber(buildFeatureDefinitions(), buildStepDefinitionFunction());
            cucumber.attachListener(new ChutzpahCucumberReporter());
            cucumber.start(function () { });
        };
    }

    function isCucumberLoaded() {
        return typeof window.Cucumber != "undefined";
    }

    function onCucumberLoaded() { }
    
    function onPageLoaded() { }

    function isTestingDone() {
        return window.chutzpah.isTestingFinished === true;
    }

    try {
        chutzpah.runner(onInitialized, onPageLoaded, isCucumberLoaded, onCucumberLoaded, isTestingDone);
    } catch (e) {
        phantom.exit(2); // Unknown error
    }
}());
