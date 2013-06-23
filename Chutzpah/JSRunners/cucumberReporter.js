var ChutzpahCucumberReporter = function () {
    var self = this;

    return {
        hear: function (event, callback) {
            var eventName = event.getName();
            console.log(eventName);

            switch (eventName) {
                case 'BeforeFeature':
                    self.currentFeatureName = event.getPayloadItem('feature').getName();
                    break;
                case 'AfterScenario':
                    // TODO: Push test result
                    break;

                case 'StepResult':
                    var stepResult = event.getPayloadItem('stepResult');
                    var stepName = stepResult.getStep().getName();

                    if (scenarioError == null && scenarioSkipped == false) {
                        if (stepResult.isFailed()) {
                            console.log(stepName + " failed");
                        } else if (stepResult.isPending() || stepResult.isSkipped() || stepResult.isUndefined()) {
                            console.log(stepName + " was skipped");
                        } else {
                            console.log(stepName + " passed");
                        }
                    }

                    break;
            }
            callback();
        }
    };
};
