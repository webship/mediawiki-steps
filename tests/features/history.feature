@history
Feature: The history of a page
  As an editor of the wiki
  I want to compare two revisions of a page and undo a change
  So that a wrong change is found and taken back

  Background:
    Given the page "History test page" has the text "First version of the page." with the summary "First version"
    And the page "History test page" has the text "Second version of the page." with the summary "Second version"

  Scenario: Two revisions compared
    Given I am a logged in user with the "editor" user
    When I open the history of the page "History test page"
    Then the history should list 2 revisions
    And the history should list the revision "Second version" by "administrator"
    When I compare the revisions "First version" and "Second version"
    Then the changes should show "Second version of the page." added
    And the changes should show "First version of the page." removed

  Scenario: A change undone
    Given I am a logged in user with the "editor" user
    When I open the history of the page "History test page"
    And I undo the revision "Second version"
    And I save the page with the summary "Back to the first version"
    Then the edit should be saved
    And the page text should contain "First version of the page."
    And the page text should not contain "Second version of the page."
    When I open the history of the page "History test page"
    Then the history should list 3 revisions
    And the history should list the revision "Back to the first version" by "editor"
