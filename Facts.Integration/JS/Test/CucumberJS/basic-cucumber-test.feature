Scenario: A basic test
	As a Chutzpah user
	I want Chutzpah to run my basic CucumberJS tests and tell me the results
	So I can write BDD-driven JS tests

	Feature: Simple numerical comparison test
		Given x = 10
		When I do nothing
		Then x = 10

	Feature: Simple addition test
		Given x = 10
		When I add 5 to x
		Then x = 15

	Feature: Failing simple multiplications test
		Given x = 10
		When I multiply x by 5
		Then x = 55
