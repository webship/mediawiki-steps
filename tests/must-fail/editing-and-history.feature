@must-fail
Feature: Assertions that must fail: the editors and the history
  Each scenario ends with a step that asserts something that is not true on the test wiki.

  Scenario: A preview without the text
    Fails with: The preview does not show "Text that is not there".
    Given the page "Editing test page" has the text "Words to change."
    And I am a logged in user with the "editor" user
    When I edit the page "Editing test page"
    And I set the wikitext to "Words changed."
    And I preview the page
    Then the preview should show "Text that is not there"

  Scenario: A save without a conflict
    Fails with: The wiki did not answer with an edit conflict
    Given the page "Editing test page" has the text "Words to change."
    And I am a logged in user with the "editor" user
    When I edit the page "Editing test page"
    And I set the wikitext to "Words changed."
    And I save the page
    Then I should see an edit conflict

  Scenario: The visual editor that was not opened
    Fails with: The visual editor is not open
    Given the page "Visual editor test page" has the text "A page."
    And I am a logged in user with the "editor" user
    When I open the page "Visual editor test page"
    Then the visual editor should be open

  Scenario: A history counted wrong
    Fails with: The history lists 2 revision(s), not 3
    Given the page "History test page" has the text "First version of the page." with the summary "First version"
    And the page "History test page" has the text "Second version of the page." with the summary "Second version"
    And I am a logged in user with the "editor" user
    When I open the history of the page "History test page"
    Then the history should list 3 revisions

  Scenario: A preference that is not ticked
    Fails with: The preference "Mark all edits minor by default" is not ticked.
    Given I am a logged in user with the "editor" user
    When I open my preferences
    Then the preference "Mark all edits minor by default" should be ticked

  Scenario: A page that is not watched
    Fails with: The watch star says the page is unwatched.
    Given the page "Watched test page" has the text "A page to watch."
    And I am a logged in user with the "editor" user
    When I open the page "Watched test page"
    Then I should be watching the page
