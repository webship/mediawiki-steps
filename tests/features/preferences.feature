@preferences
Feature: The preferences of an account
  As an editor of the wiki
  I want to change my preferences and find them kept
  So that the wiki works the way I edit

  Scenario: A preference ticked, saved, then put back
    Given I am a logged in user with the "editor" user
    When I open my preferences
    And I tick the preference "Mark all edits minor by default"
    And I save my preferences
    Then the preference "Mark all edits minor by default" should be ticked
    When I untick the preference "Mark all edits minor by default"
    And I save my preferences
    Then the preference "Mark all edits minor by default" should not be ticked
