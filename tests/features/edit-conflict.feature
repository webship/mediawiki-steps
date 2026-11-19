@edit-conflict
Feature: An edit conflict
  As an editor of the wiki
  I want the wiki to stop my save when someone else changed the same lines meanwhile
  So that I never overwrite another person's work without seeing it

  Scenario: Another account changes the same line while the editor writes
    Given the page "Conflict test page" has the text "The first line."
    And I am a logged in user with the "editor" user
    When I edit the page "Conflict test page"
    And I set the wikitext to "My own first line."
    And another account saves the page "Conflict test page" with the text "Changed by another account."
    And I save the page with the summary "My change"
    Then I should see an edit conflict
    And the edit conflict should keep my text "My own first line."
