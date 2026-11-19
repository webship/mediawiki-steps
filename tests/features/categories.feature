@categories
Feature: Categories and the category tree
  As a reader of the wiki
  I want the page of a category to list its pages and to open its subcategories in place
  So that I browse a subject from the general to the particular

  Background:
    Given the page "Category:Test pages" has the text "The pages of the test wiki."
    And the page "Category:Test guides" has the text "Guides of the test wiki. [[Category:Test pages]]"
    And the page "Category:Editing guides" has the text "Guides about editing. [[Category:Test guides]]"
    And the page "Categorised test page" has the text "A page in a category. [[Category:Test guides]]"

  Scenario: A category lists its pages and subcategories
    Given I am an anonymous user
    When I open the page "Category:Test guides"
    Then the category should list the page "Categorised test page"
    And the category should list the subcategory "Editing guides"
    And the page should be in the category "Test pages"

  Scenario: The category tree opens a subcategory in place
    Given I am an anonymous user
    When I open the page "Category:Test pages"
    Then the category should list the subcategory "Test guides"
    And the category tree should not show "Editing guides" under "Test guides"
    When I expand the category "Test guides" in the category tree
    Then the category tree should show "Editing guides" under "Test guides"
    When I collapse the category "Test guides" in the category tree
    Then the category tree should not show "Editing guides" under "Test guides"
