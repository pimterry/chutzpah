﻿using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using Chutzpah.Models;
using Chutzpah.Wrappers;

namespace Chutzpah
{
    public class TestHarness
    {
        private readonly ChutzpahTestSettingsFile chutzpahTestSettings;
        private readonly TestOptions testOptions;
        private readonly IFileSystemWrapper fileSystem;
        private readonly string amdModulePath;

        public IList<TestHarnessItem> CodeCoverageDependencies { get; private set; }
        public IList<TestHarnessItem> TestFrameworkDependencies { get; private set; }
        public IList<TestHarnessItem> ReferencedHtmlTemplates { get; private set; }
        public IList<TestHarnessItem> ReferencedScripts { get; private set; }
        public IList<TestHarnessItem> ReferencedStyles { get; private set; }

        public TestHarness(ChutzpahTestSettingsFile chutzpahTestSettings, TestOptions testOptions, IEnumerable<ReferencedFile> referencedFiles, IFileSystemWrapper fileSystem, string amdModulePath)
        {
            this.chutzpahTestSettings = chutzpahTestSettings;
            this.testOptions = testOptions;
            this.fileSystem = fileSystem;
            this.amdModulePath = amdModulePath;

            BuildTags(referencedFiles);
            CleanupTestHarness();
        }

        public string CreateHtmlText(string testHtmlTemplate, Dictionary<string, string> frameworkReplacements)
        {
            var testJsReplacement = new StringBuilder();
            var testFrameworkDependencies = new StringBuilder();
            var codeCoverageDependencies = new StringBuilder();
            var referenceJsReplacement = new StringBuilder();
            var referenceCssReplacement = new StringBuilder();
            var referenceHtmlTemplateReplacement = new StringBuilder();

            BuildReferenceHtml(testFrameworkDependencies,
                               referenceCssReplacement,
                               testJsReplacement,
                               referenceJsReplacement,
                               referenceHtmlTemplateReplacement,
                               codeCoverageDependencies);

            var replacements = new Dictionary<string, string>
            {
                {"TestFrameworkDependencies", testFrameworkDependencies.ToString()},
                {"CodeCoverageDependencies", codeCoverageDependencies.ToString()},
                {"TestJSFile", testJsReplacement.ToString()},
                {"ReferencedJSFiles", referenceJsReplacement.ToString()},
                {"ReferencedCSSFiles", referenceCssReplacement.ToString()},
                {"TestHtmlTemplateFiles", referenceHtmlTemplateReplacement.ToString()},
                {"AMDTestPath", amdModulePath}
            };

            var testHtmlStringBuilder = new StringBuilder(testHtmlTemplate);
            
            foreach (var replacement in replacements.Union(frameworkReplacements))
            {
                testHtmlStringBuilder.Replace("@@" + replacement.Key + "@@", replacement.Value);
            }

            return testHtmlStringBuilder.ToString();
        }

        private void BuildTags(IEnumerable<ReferencedFile> referencedFilePaths)
        {
            ReferencedHtmlTemplates = new List<TestHarnessItem>();
            ReferencedScripts = new List<TestHarnessItem>();
            ReferencedStyles = new List<TestHarnessItem>();
            TestFrameworkDependencies = new List<TestHarnessItem>();
            CodeCoverageDependencies = new List<TestHarnessItem>();

            foreach (ReferencedFile referencedFile in referencedFilePaths)
            {
                string referencePath = string.IsNullOrEmpty(referencedFile.GeneratedFilePath)
                                        ? referencedFile.Path
                                        : referencedFile.GeneratedFilePath;
                IList<TestHarnessItem> refList = ChooseRefList(referencedFile, referencePath);
                if (refList == null) continue;

                if (referencePath.EndsWith(Constants.CssExtension, StringComparison.OrdinalIgnoreCase))
                {
                    refList.Add(new ExternalStylesheet(referencedFile));
                }
                else if (referencePath.EndsWith(Constants.PngExtension, StringComparison.OrdinalIgnoreCase))
                {
                    refList.Add(new ShortcutIcon(referencedFile));
                }
                else if (referencePath.EndsWith(Constants.JavaScriptExtension, StringComparison.OrdinalIgnoreCase))
                {
                    refList.Add(new Script(referencedFile));
                }
                else if (referencePath.EndsWith(Constants.HtmlScriptExtension, StringComparison.OrdinalIgnoreCase) ||
                         referencePath.EndsWith(Constants.HtmScriptExtension, StringComparison.OrdinalIgnoreCase))
                {
                    refList.Add(new Html(referencedFile, fileSystem));
                }
            }
        }

        private IList<TestHarnessItem> ChooseRefList(ReferencedFile referencedFile, string referencePath)
        {
            // If CodeCoverage is enabled make sure we load requirejs before the code coverage files
            var amdLoader = testOptions.CoverageOptions.Enabled && RegexPatterns.IsRequireJsFileName.IsMatch(Path.GetFileName(referencedFile.Path));

            IList<TestHarnessItem> list = null;
            if (referencedFile.IsTestFrameworkDependency)
            {
                list = TestFrameworkDependencies;
            }
            else if (referencedFile.IsCodeCoverageDependency || amdLoader)
            {
                list = CodeCoverageDependencies;
            }
            else if (referencePath.EndsWith(Constants.CssExtension, StringComparison.OrdinalIgnoreCase))
            {
                list = ReferencedStyles;
            }
            else if (referencePath.EndsWith(Constants.JavaScriptExtension, StringComparison.OrdinalIgnoreCase))
            {
                list = ReferencedScripts;

            }
            else if (referencePath.EndsWith(Constants.HtmlScriptExtension, StringComparison.OrdinalIgnoreCase) ||
                     referencePath.EndsWith(Constants.HtmScriptExtension, StringComparison.OrdinalIgnoreCase))
            {
                list = ReferencedHtmlTemplates;
            }
            return list;
        }

        private void BuildReferenceHtml(StringBuilder testFrameworkDependencies, StringBuilder referenceCssReplacement, StringBuilder testJsReplacement, StringBuilder referenceJsReplacement, StringBuilder referenceHtmlTemplateReplacement, StringBuilder codeCoverageDependencies)
        {
            foreach (TestHarnessItem item in TestFrameworkDependencies)
            {
                testFrameworkDependencies.AppendLine(item.ToString());
            }

            foreach (TestHarnessItem item in CodeCoverageDependencies)
            {
                codeCoverageDependencies.AppendLine(item.ToString());
            }

            foreach (TestHarnessItem item in ReferencedScripts.Where(x => !x.HasFile || x.ReferencedFile.IncludeInTestHarness))
            {

                if (item.ReferencedFile != null && item.ReferencedFile.IsFileUnderTest)
                {
                    testJsReplacement.AppendLine(item.ToString());
                }
                else
                {
                    referenceJsReplacement.AppendLine(item.ToString());
                }
            }
            foreach (TestHarnessItem item in ReferencedStyles)
            {
                referenceCssReplacement.AppendLine(item.ToString());
            }
            foreach (TestHarnessItem item in ReferencedHtmlTemplates)
            {
                referenceHtmlTemplateReplacement.AppendLine(item.ToString());
            }
        }


        private void CleanupTestHarness()
        {
            // TODO: Remove this need for this by updating the logic in the framework definition to support regex matches in ReferenceIsDependency

            // Remove additional references to QUnit.
            // (Iterate over a copy to avoid concurrent modification of the list!)
            foreach (TestHarnessItem reference in ReferencedScripts.Where(r => r.HasFile).ToList())
            {
                if (reference.ReferencedFile.IsFileUnderTest) continue;

                string fileName = Path.GetFileName(reference.ReferencedFile.Path);
                if (!string.IsNullOrEmpty(fileName) && RegexPatterns.IsQUnitFileName.IsMatch(fileName))
                {
                    ReferencedScripts.Remove(reference);
                }
            }
        }

    }

    public class TestHarnessItem
    {
        private readonly bool explicitEndTag;
        private readonly string contents;
        private readonly string tagName;

        public IDictionary<string, string> Attributes { get; private set; }
        public ReferencedFile ReferencedFile { get; private set; }
        public bool HasFile { get { return ReferencedFile != null; } }

        internal TestHarnessItem(ReferencedFile referencedFile, string tagName, bool explicitEndTag)
            : this(tagName, explicitEndTag)
        {
            ReferencedFile = referencedFile;
        }

        internal TestHarnessItem(string contents, string tagName, bool explicitEndTag)
            : this(tagName, explicitEndTag)
        {
            this.contents = contents;
        }

        private TestHarnessItem(string tagName, bool explicitEndTag)
        {
            this.tagName = tagName;
            this.explicitEndTag = explicitEndTag;
            Attributes = new Dictionary<string, string>();
        }

        public override string ToString()
        {
            StringBuilder builder = new StringBuilder("<");
            builder.Append(tagName);
            foreach (var entry in Attributes)
            {
                if (entry.Value == null)
                {
                    builder.AppendFormat(@" {0} ", entry.Key);
                }
                else
                {
                    builder.AppendFormat(@" {0}=""{1}""", entry.Key, entry.Value);
                }
            }
            if (explicitEndTag || contents != null)
            {
                builder.AppendFormat(">{1}</{0}>", tagName, contents ?? "");
            }
            else
            {
                builder.Append("/>");
            }
            return builder.ToString();
        }

        protected static string GetAbsoluteFileUrl(ReferencedFile referencedFile)
        {
            string referencePath = string.IsNullOrEmpty(referencedFile.GeneratedFilePath)
                        ? referencedFile.Path
                        : referencedFile.GeneratedFilePath;

            if (!RegexPatterns.SchemePrefixRegex.IsMatch(referencePath))
            {
                // Encode the reference path and then decode / (forward slash) and \ (back slash) into / (forward slash)
                return "file:///" + FileProbe.EncodeFilePath(referencePath);
            }

            return referencePath;
        }
    }

    public class ExternalStylesheet : TestHarnessItem
    {
        public ExternalStylesheet(ReferencedFile referencedFile)
            : base(referencedFile, "link", false)
        {
            Attributes.Add("rel", "stylesheet");
            Attributes.Add("type", "text/css");
            Attributes.Add("href", GetAbsoluteFileUrl(referencedFile));
        }
    }

    public class ShortcutIcon : TestHarnessItem
    {
        public ShortcutIcon(ReferencedFile referencedFile)
            : base(referencedFile, "link", false)
        {
            Attributes.Add("rel", "shortcut icon");
            Attributes.Add("type", "image/png");
            Attributes.Add("href", GetAbsoluteFileUrl(referencedFile));
        }
    }

    public class Script : TestHarnessItem
    {
        public Script(ReferencedFile referencedFile)
            : base(referencedFile, "script", true)
        {
            Attributes.Add("type", "text/javascript");
            Attributes.Add("src", GetAbsoluteFileUrl(referencedFile));
        }

        public Script(string scriptCode)
            : base(scriptCode, "script", true)
        {
            Attributes.Add("type", "text/javascript");
        }
    }

    public class Html : TestHarnessItem
    {
        private readonly string contents;

        public Html(ReferencedFile referencedFile, IFileSystemWrapper fileSystem)
            : base(referencedFile, null, false)
        {
            contents = fileSystem.GetText(referencedFile.Path);
        }

        public override string ToString()
        {
            return contents;
        }
    }
}
