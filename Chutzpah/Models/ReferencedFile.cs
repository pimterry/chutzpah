﻿using System.Collections.Generic;

namespace Chutzpah.Models
{
    public class ReferencedFile
    {
        public ReferencedFile()
        {
            FilePositions = new FilePositions();
            ReferencedFiles = new List<ReferencedFile>();
            IncludeInTestHarness = true;

        }

        public bool IsFileUnderTest { get; set; }

        /// <summary>
        /// The path to the reference file
        /// </summary>
        public string Path { get; set; }

        public bool IsLocal { get; set; }
        public FilePositions FilePositions { get; set; }
        public IList<ReferencedFile> ReferencedFiles { get; set; }

        /// <summary>
        /// This is a path the the generated version of this referenced file. 
        /// This will be used when a file is in a different language like CoffeeScript
        /// </summary>
        public string GeneratedFilePath { get; set; }

        /// <summary>
        /// Gets if this is a dependency of the test framework
        /// </summary>
        public bool IsTestFrameworkDependency { get; set; }

        /// <summary>
        /// Gets if this is a dependency of the code coverage framework
        /// </summary>
        public bool IsCodeCoverageDependency { get; set; }

        /// <summary>
        /// Should this reference be included into the test harness.
        /// </summary>
        public bool IncludeInTestHarness { get; set; }
    }
}