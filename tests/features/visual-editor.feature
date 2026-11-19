@visual-editor
Feature: The visual editor
  As an editor of the wiki
  I want to change a page as it looks, without wikitext
  So that I can edit without learning the markup

  Scenario: An editor types in the visual editor and saves with a summary
    Given the page "Visual editor test page" has the text "A page to change in the visual editor."
    And I am a logged in user with the "editor" user
    When I edit the page "Visual editor test page" in the visual editor
    Then the visual editor should be open
    When I type " Typed in the visual editor." in the visual editor
    And I save the page with the summary "A sentence in the visual editor"
    Then the visual editor should not be open
    And the edit should be saved
    And the page text should contain "Typed in the visual editor."
    When I open the history of the page "Visual editor test page"
    Then the history should list the revision "A sentence in the visual editor" by "editor"
