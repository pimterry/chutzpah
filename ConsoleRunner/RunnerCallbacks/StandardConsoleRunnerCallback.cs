﻿using System;
using System.Globalization;
using System.IO;
using System.Linq;
using Chutzpah.Coverage;
using Chutzpah.Models;
using Chutzpah.Wrappers;

namespace Chutzpah.RunnerCallbacks
{
    public class StandardConsoleRunnerCallback : ConsoleRunnerCallback
    {
        readonly bool silent;
        readonly bool vsoutput;
        private bool showFailureReport;
        int testCount;
        private readonly bool haveConsole;

        public StandardConsoleRunnerCallback(bool silent, bool vsoutput, bool showFailureReport)
        {
            this.silent = silent;
            this.vsoutput = vsoutput;
            this.showFailureReport = showFailureReport;

            try
            {
                // BufferWidth throws an IOException if there is no console attached
                var temp = Console.BufferWidth;
                haveConsole = true;
            }
            catch (IOException)
            {
                haveConsole = false;
            }

        }

        public override void FileLog(TestLog log)
        {
            ClearCounter();

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine(GetFileLogMessage(log));
            Console.ResetColor();
        }

        public override void TestSuiteFinished(TestCaseSummary testResultsSummary)
        {

            if (testResultsSummary.CoverageObject != null && testResultsSummary.CoverageObject.Any())
            {
                Console.WriteLine();
                PrintCodeCoverageResults(testResultsSummary.CoverageObject);
            }

            if (showFailureReport)
            {
                PrintErrorReport(testResultsSummary);
            }


            Console.WriteLine();
            var seconds = testResultsSummary.TotalRuntime / 1000.0;
            Console.WriteLine("=== {0} total, {1} failed, took {2:n} seconds ===", testResultsSummary.TotalCount, testResultsSummary.FailedCount, seconds);

            base.TestSuiteFinished(testResultsSummary);
        }

        private void PrintErrorReport(TestCaseSummary testResultsSummary)
        {
            var failedTests = (from fileResult in testResultsSummary.TestFileSummaries 
                              from testResult in fileResult.Tests 
                              where !testResult.Passed
                              select testResult).ToList();

            var fileErrors = (from fileResult in testResultsSummary.TestFileSummaries
                              from fileError in fileResult.Errors
                              select fileError).ToList();

            if (failedTests.Count > 0)
            {

                Console.WriteLine("\n\n--- Failure Report :: {0} Failed Tests, {1} File Errors ---", failedTests.Count, fileErrors.Count);

                foreach (var fileError in fileErrors)
                {
                    FileError(fileError);    
                }

                foreach (var result in failedTests)
                {
                    TestFailed(result);
                }


                Console.WriteLine("-----------------------------------------");
            }
        }

        public override void FileFinished(string fileName, TestFileSummary testResultsSummary)
        {
            ClearCounter();

            Console.WriteLine("File: {0}", fileName);
            var seconds = testResultsSummary.TimeTaken / 1000.0;
            Console.WriteLine(Indent("{0} total, {1} failed, took {2:n} seconds", 2), testResultsSummary.TotalCount, testResultsSummary.FailedCount, seconds);
            Console.WriteLine();


            PrintRunningTestCount();

            base.FileFinished(fileName, testResultsSummary);
        }

        protected override void TestFailed(TestCase testCase)
        {
            ClearCounter();

            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("{0} [FAIL]", testCase.GetDisplayName());
            Console.ResetColor();

            Console.WriteLine(Indent(GetTestFailureMessage(testCase)));

            Console.WriteLine();
        }

        protected override string GetTestFailureLocationString(TestCase testCase)
        {
            if (vsoutput)
            {
                var s = String.Empty;

                foreach (var result in testCase.TestResults.Where(x => !x.Passed))
                {
                    s += string.Format("{0}({1},{2}):{3} {4} {5}: {6}: {7}\n",
                        testCase.InputTestFile,
                        testCase.Line,
                        testCase.Column,
                        "",
                        "error",
                        "C0001",
                        string.Format("Test '{0}' failed", testCase.GetDisplayName()),
                        result.GetFailureMessage());
                }

                return s;
            }

            return base.GetTestFailureLocationString(testCase);
        }

        public override void ExceptionThrown(Exception exception, string fileName)
        {
            ClearCounter();

            Console.ForegroundColor = ConsoleColor.Red;

            var errorMessage = GetExceptionThrownMessage(exception, fileName);
            Console.WriteLine(errorMessage);
            Console.ResetColor();
        }

        public override void FileError(TestError error)
        {
            ClearCounter();

            Console.ForegroundColor = ConsoleColor.Red;

            var errorMessage = GetFileErrorMessage(error);
            Console.WriteLine(errorMessage);
            Console.ResetColor();
        }

        private void PrintCodeCoverageResults(CoverageData coverage)
        {
            Console.WriteLine(GetCodeCoverageMessage(coverage));
        }

        protected override void TestComplete(TestCase testCase)
        {
            ++testCount;
            PrintRunningTestCount();
        }

        void ClearCounter()
        {
            if (!silent)
            {

                Console.Write("\r");
                if (haveConsole)
                {
                    Console.Write(" ".PadLeft(Console.BufferWidth));
                }
                else
                {
                    // Lets use a fixed width of 80 chars
                    Console.Write(" ".PadLeft(80));
                }
                Console.Write("\r");
            }
        }

        void PrintRunningTestCount()
        {
            if (!silent)
            {
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.Write("\rTests complete: {0}", testCount);
                Console.ResetColor();
            }
        }

        string Indent(string message)
        {
            return Indent(message, 0);
        }

        string Indent(string message, int additionalSpaces)
        {
            string result = "";
            string indent = "".PadRight(additionalSpaces + 3);

            foreach (string line in message.Split(new[] { Environment.NewLine }, StringSplitOptions.None))
                result += indent + line + Environment.NewLine;

            return result.TrimEnd();
        }
    }
}