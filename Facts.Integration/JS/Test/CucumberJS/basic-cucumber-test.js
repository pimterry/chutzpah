function basicCucumberSteps() {
    var x;

    this.Given("x = $value", function(value, callback) {
        x = parseFloat(value);

        callback();
    });

    this.When("I do nothing", function (callback) {
        callback();
    });

    this.When("I add $value to x", function (value, callback) {
        x += parseFloat(value);

        callback();
    });

    this.When("I multiply x by $value", function (value, callback) {
        x *= parseFloat(value);

        callback();
    });

    this.Then("x = $value", function(value, callback) {
        if (x != parseFloat(value)) {
            callback.fail(new Error("Expected x to equal " + value + " but was " + x));
        } else {
            callback();
        }
    });
}
