@must-fail
Feature: Assertions that must fail: administration and files
  Each scenario ends with a step that asserts something that is not true on the test wiki.

  Scenario: Semi-protection taken for full protection
    Fails with: "Protection test page" is protected for "autoconfirmed", not for "sysop".
    Given the page "Protection test page" has the text "A page to protect."
    And the page "Protection test page" is protected so that only autoconfirmed users can edit it
    Then the page "Protection test page" should be protected so that only administrators can edit it

  Scenario: A page the editor may edit
    Fails with: The wiki did not refuse "Editing test page"
    Given the page "Editing test page" has the text "Any account may edit this page."
    And I am a logged in user with the "editor" user
    Then editing the page "Editing test page" should be refused with "This page has been protected"

  Scenario: An account that is not blocked
    Fails with: "Reader" is not blocked.
    Given the account "reader" is not blocked
    Then the account "reader" should be blocked

  Scenario: A page that exists
    Fails with: "Main Page" exists on the wiki.
    Then the page "Main Page" should not exist

  Scenario: An upload that went through
    Fails with: The wiki did not hold the upload back with a warning
    Given the page "File:Test square.png" does not exist
    And I am a logged in user with the "editor" user
    When I upload the file "tests/fixtures/blue-square.png" as "Test square.png" ignoring warnings
    Then the upload should be held back with the warning "This file is a duplicate"
