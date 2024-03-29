using System.Collections.Generic;
using Chutzpah.Models;

namespace Chutzpah
{
    public interface ITestRunner
    {
        /// <summary>
        /// Gets a test context for a given test file. The test context contains the paths
        /// of all the items needs to run the test
        /// </summary>
        /// <param name="testFile">The file contains the tests</param>
        /// <returns>A test context</returns>
        TestContext GetTestContext(string testFile);

        /// <summary>
        /// Gets a test context for a given test file. The test context contains the paths
        /// of all the items needs to run the test
        /// </summary>
        /// <param name="testFile">The file contains the tests</param>
        /// <param name="options">The testing options</param>
        /// <returns>A test context</returns>
        TestContext GetTestContext(string testFile, TestOptions options);


        TestCaseSummary RunTests(string testPath, ITestMethodRunnerCallback callback = null);
        TestCaseSummary RunTests(string testPath, TestOptions options, ITestMethodRunnerCallback callback = null);
        TestCaseSummary RunTests(IEnumerable<string> testPaths, TestOptions options, ITestMethodRunnerCallback callback = null);
        TestCaseSummary RunTests(IEnumerable<string> testPaths, ITestMethodRunnerCallback callback = null);


        IEnumerable<TestCase> DiscoverTests(string testPath);
        IEnumerable<TestCase> DiscoverTests(IEnumerable<string> testPaths);
        bool IsTestFile(string testFile);
        IEnumerable<TestCase> DiscoverTests(IEnumerable<string> testPaths, TestOptions options);
        void CleanTestContext(TestContext context);
        void EnableDebugMode();
    }
}