namespace Chutzpah.FrameworkDefinitions
{
    using System.Collections.Generic;
    using System.Linq;
    using System.Text.RegularExpressions;
    using Chutzpah.FileProcessors;

    /// <summary>
    /// Definition that describes the CucumberJS framework.
    /// </summary>
    public class CucumberJsDefinition : BaseFrameworkDefinition
    {
        private IEnumerable<ICucumberJsReferencedFileProcessor> fileProcessors;
        private IEnumerable<string> fileDependencies;

        /// <summary>
        /// Initializes a new instance of the CucumberJsDefinition class.
        /// </summary>
        public CucumberJsDefinition(IEnumerable<ICucumberJsReferencedFileProcessor> fileProcessors)
        {
            this.fileProcessors = fileProcessors;
            this.fileDependencies = new []
                {
                    "CucumberJS\\cucumber.js"
                };
        }

        /// <summary>
        /// Gets a list of file dependencies to bundle with the CucumberJS test harness.
        /// </summary>
        public override IEnumerable<string> FileDependencies
        {
            get
            {
                return this.fileDependencies;
            }
        }

        public override string TestHarness
        {
            get { return @"Cucumber\cucumber.html"; }
        }

        /// <summary>
        /// Gets a short, file system friendly key for the CucumberJS library.
        /// </summary>
        public override string FrameworkKey
        {
            get
            {
                return "cucumber";
            }
        }

        /// <summary>
        /// Gets a regular expression pattern to match a testable CucumberJS file in a JavaScript file.
        /// </summary>
        protected override Regex FrameworkSignatureJavaScript
        {
            get
            {
                return RegexPatterns.CucumberJsTestRegexJavaScript;
            }
        }

        /// <summary>
        /// Gets a regular expression pattern to match a testable CucumberJS file in a CoffeeScript file.
        /// </summary>
        protected override Regex FrameworkSignatureCoffeeScript
        {
            get
            {
                return RegexPatterns.CucumberJsTestRegexCoffeeScript;
            }
        }

        /// <summary>
        /// Gets a list of file processors to call within the Process method.
        /// </summary>
        protected override IEnumerable<IReferencedFileProcessor> FileProcessors
        {
            get
            {
                return this.fileProcessors;
            }
        }
    }
}
