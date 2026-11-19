@must-fail
Feature: Assertions that must fail: the session, account creation and search
  Each scenario ends with a step that asserts something that is not true on the test wiki.
  tests/check-must-fail.js runs them and checks that each fails at its last step with its message.

  Scenario: Another account is signed in
    Fails with: Expected "editor" (Editor) to be signed in; the wiki says "Reader" is.
    Given I am a logged in user with the "reader" user
    Then I should be logged in as "editor"

  Scenario: A refusal with another message
    Fails with: The login page did not refuse the login with "Your account is locked."
    Given I am an anonymous user
    When I log in with the user name "No such account here" and the password "Wrong-password-1"
    Then the login should be refused with "Your account is locked."

  Scenario: A name in use is not refused for different passwords
    Fails with: The account creation form did not refuse with "The passwords you entered do not match."
    Given I am an anonymous user
    When I try to create the account "editor" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-x"
    Then the account creation should be refused with "The passwords you entered do not match."

  Scenario: A form the wiki would accept is not sent
    Fails with: The form shows no problem with the account "Never created account": sending it would create the account
    Given I am an anonymous user
    When I try to create the account "Never created account" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-x"

  Scenario: A suggestion that does not start with the typed text
    Fails with: The search suggestions do not list "Second searching page".
    Given the page "Searching test page" has the text "Lighthouses guide ships along rocky coasts at night."
    And the page "Second searching page" has the text "A page about harbours."
    And I am an anonymous user
    And I am on the page "Main Page"
    When I type "Searching te" in the search box
    Then the search suggestions should list "Second searching page"

  Scenario: A search that finds one page, counted as two
    Fails with: The search found 1 page(s), not 2.
    Given the page "Searching test page" has the text "Lighthouses guide ships along rocky coasts at night."
    And I am an anonymous user
    And I am on the page "Main Page"
    When I search for "lighthouses"
    Then the search should find 2 pages
