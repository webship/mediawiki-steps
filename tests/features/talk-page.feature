@talk-page
Feature: The talk page of a page
  As an editor of the wiki
  I want to ask about a page on its talk page
  So that questions about the page stay out of the page itself

  Scenario: An editor adds a topic to the talk page of a page
    Given the page "Talk test page" has the text "A page to talk about."
    And the page "Talk:Talk test page" does not exist
    And I am a logged in user with the "editor" user
    When I open the page "Talk test page"
    And I open the talk page
    And I add the topic "A question about this page" with the text "Is this page complete?"
    Then I should see the page "Talk:Talk test page"
    And the talk page should have the topic "A question about this page"
    And the page text should contain "Is this page complete?"
    When I add the topic "A second question" with the text "Who wrote the overview?"
    Then the talk page should have the topic "A second question"
    And the talk page should have the topic "A question about this page"
