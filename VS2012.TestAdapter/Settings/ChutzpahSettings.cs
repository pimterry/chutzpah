﻿using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace Chutzpah.VS.Common.Settings
{
    /// <summary>
    /// General options page
    /// </summary>
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    [Guid("5A1369BC-C7CE-4176-9080-84BA3F6125AB")]
    public class ChutzpahSettings : DialogPage
    {
        public ChutzpahSettings()
        {
            // Set default value, these will get overridden when user changes them
            MaxDegreeOfParallelism = 1;
        }

        [Browsable(true)]
        [Category("General")]
        [DisplayName("Test timeout (ms)")]
        [Description("How long to wait for a given test to finish before timing out? (Defaults to 5000 ms)")]
        public int? TimeoutMilliseconds { get; set; }

        [Browsable(true)]
        [Category("General")]
        [DisplayName("Max degree of Parallelism")]
        [Description("The maximum amount of concurreny Chutzpah should use")]
        public int MaxDegreeOfParallelism { get; set; }

        public override void ResetSettings()
        {
            TimeoutMilliseconds = null;
            MaxDegreeOfParallelism = 1;
            base.ResetSettings();
        }

    }
}