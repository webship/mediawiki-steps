@must-fail
Feature: Assertions that must fail: reading a page, categories and talk pages
  Each scenario ends with a step that asserts something that is not true on the test wiki.

  Background:
    Given the page "Reading test page" has the text:
      """
      A reading page.<ref>Every page keeps its history.</ref>

      == Overview ==
      [[Page not written yet]] and [[Main Page]].

      == References ==
      <references />

      [[Category:Test guides]]
      """

  Scenario: A section the page does not have
    Fails with: The page has no section "History".
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the page should have the section "History"

  Scenario: A red link taken for a page that exists
    Fails with: The page has no link to the page "Page not written yet".
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the page should link to the page "Page not written yet"

  Scenario: A reference with another text
    Fails with: The reference [1] reads "Every page keeps its history.", not "A note the page does not have."
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the reference "1" should read "A note the page does not have."

  Scenario: A category the page is not in
    Fails with: The page is not in the category "Drafts".
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the page should be in the category "Drafts"

  Scenario: A subcategory not shown before the tree is expanded
    Fails with: The category tree does not show "Editing guides" under "Test guides".
    Given the page "Category:Test pages" has the text "The pages of the test wiki."
    And the page "Category:Test guides" has the text "Guides. [[Category:Test pages]]"
    And the page "Category:Editing guides" has the text "Editing. [[Category:Test guides]]"
    And I am an anonymous user
    When I open the page "Category:Test pages"
    Then the category tree should show "Editing guides" under "Test guides"

  Scenario: A topic nobody added
    Fails with: The talk page has no topic "Never added".
    Given the page "Talk:Reading test page" has the text "== A real topic ==\nA question."
    And I am an anonymous user
    When I open the page "Talk:Reading test page"
    Then the talk page should have the topic "Never added"
