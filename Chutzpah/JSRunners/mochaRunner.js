﻿(function () {
    'use strict';

    function onInitialized() {
        console.log("!!_!! onInitialized");
        
        chutzpah.isTestingFinished = false;
        chutzpah.testCases = [];
    }

    function onPageLoaded() {
        console.log("!!_!! onPageLoaded");
    }

    function isMochaLoaded() {
        console.log("!!_!! isMochaLoaded");
        
        return typeof global != 'undefined' && typeof global.mocha != 'undefined';
    }

    function onMochaLoaded() {
        console.log("!!_!! onMochaLoaded");
        
        function log(obj) {
            console.log(JSON.stringify(obj));
        }

        function discoverTests(suite) {
            suite.tests.forEach(function (test) {
                var testCase = { moduleName: suite.fullTitle(), testName: test.title };
                log({ type: "TestDone", testCase: testCase });
            });

            suite.suites.forEach(discoverTests);
        }

        if (chutzpah.testMode === 'discovery') {
            window.mocha.run = function () {
                discoverTests(window.mocha.suite);
            };
            return;
        }

        var chutzpahMochaReporter = function (runner) {
            var startTime = null,
                activeTestCase = null,
                passed = 0,
                failed = 0,
                skipped = 0;

            runner.on('start', function () {
                startTime = new Date();

                log({ type: "FileStart" });
            });

            runner.on('end', function () {
                if (window._Chutzpah_covobj_name && window[window._Chutzpah_covobj_name]) {
                    log({ type: "CoverageObject", object: window[window._Chutzpah_covobj_name] });
                }

                log({
                    type: "FileDone",
                    timetaken: new Date() - startTime,
                    passed: passed,
                    failed: failed
                });

                chutzpah.isTestingFinished = true;
            });

            runner.on('suite', function (suite) {
                chutzpah.currentModule = suite.fullTitle();
            });

            runner.on('suite end', function (suite) {
                chutzpah.currentModule = null;
            });

            runner.on('test', function (test) {
                activeTestCase = {
                    moduleName: chutzpah.currentModule,
                    testName: test.title,
                    testResults: []
                };
                chutzpah.testCases.push(activeTestCase);
                log({ type: "TestStart", testCase: activeTestCase });
            });

            runner.on('test end', function (test) {
                if (test.pending) {
                    return;
                }
                activeTestCase.timetaken = test.duration;
                log({ type: "TestDone", testCase: activeTestCase });
            });

            //runner.on('hook', function(hook) { });
            //runner.on('hook end', function(hook) { });

            runner.on('pass', function (test) {
                passed++;
                activeTestCase.testResults.push({ passed: true });
            });

            runner.on('fail', function (test, err) {
                failed++;

                activeTestCase.testResults.push({
                    passed: false,
                    stackTrace: err.stack ? err.stack.split("\n").slice(1).join("\n") : null,
                    message: err.message
                });
            });

            runner.on('pending', function (test) {
                skipped++;

            });
        };

        window.mocha.setup({ reporter: chutzpahMochaReporter });
    }

    function isTestingDone() {
        console.log("!!_!! isTestingDone");
        return chutzpah.isTestingFinished === true;
    }

    try {
        phantom.injectJs('chutzpahRunner.js');
        chutzpah.runner(onInitialized, onPageLoaded, isMochaLoaded, onMochaLoaded, isTestingDone);
    } catch (e) {
        phantom.exit(2); // Unkown error
    }
}());
