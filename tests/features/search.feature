@search
Feature: Searching the wiki
  As a reader of the wiki
  I want the search box to suggest pages while I type, and to find pages by their words
  So that I reach a page without knowing where it is linked from

  Background:
    Given the page "Searching test page" has the text "Lighthouses guide ships along rocky coasts at night."
    And the page "Second searching page" has the text "A page about harbours, without the word of the other one."

  @critical
  Scenario: The search box suggests a page while typing, and opens it
    Given I am an anonymous user
    And I am on the page "Main Page"
    When I type "Searching te" in the search box
    Then the search suggestions should list "Searching test page"
    And the search suggestions should not list "Second searching page"
    When I choose the suggestion "Searching test page"
    Then I should see the page "Searching test page"

  Scenario: A search for a word lists the page that has it
    Given I am an anonymous user
    And I am on the page "Main Page"
    When I search for "lighthouses"
    Then the search should find 1 page
    And the search results should list the page "Searching test page"
    And the search results should not list the page "Second searching page"
    And the search result "Searching test page" should mention "lighthouses"

  Scenario: A search for a word no page has finds nothing
    Given I am an anonymous user
    And I am on the page "Main Page"
    When I search for "zzqqnothingatall"
    Then the search should find no page
