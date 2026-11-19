@source-editor
Feature: The source editor
  As an editor of the wiki
  I want to write wikitext, preview it, see my changes and save them with a summary
  So that every change is checked before it is saved and explained in the history

  @critical
  Scenario: An editor makes a page, previews it and saves it with a summary
    Given the page "Page made in the source editor" does not exist
    And I am a logged in user with the "editor" user
    When I edit the page "Page made in the source editor"
    And I set the wikitext to:
      """
      A page made in the source editor.

      == A section ==
      Its text.
      """
    And I preview the page
    Then the preview should show "A page made in the source editor."
    And the preview should not show "== A section =="
    When I save the page with the summary "First version"
    Then the page should be created
    And I should see the page "Page made in the source editor"
    And the page should have the section "A section"
    When I open the history of the page "Page made in the source editor"
    Then the history should list the revision "First version" by "editor"

  Scenario: An editor sees the changes before saving a minor edit
    Given the page "Editing test page" has the text "Words to change."
    And I am a logged in user with the "editor" user
    When I edit the page "Editing test page"
    And I set the wikitext to "Words changed in the source editor."
    And I show my changes
    Then the changes should show "Words changed in the source editor." added
    And the changes should show "Words to change." removed
    When I save the page as a minor edit with the summary "A clearer sentence"
    Then the edit should be saved
    And the page text should contain "Words changed in the source editor."
    And the page text should not contain "Words to change."
    When I open the history of the page "Editing test page"
    Then the history should list the revision "A clearer sentence" by "editor"
