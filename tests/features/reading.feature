@reading
Feature: Reading a page
  As a reader of the wiki
  I want a page with its title, contents list, sections, links, references and categories
  So that I find my way through a long page and to the pages around it

  Background:
    Given the page "Category:Test guides" has the text "Guides of the test wiki."
    And the page "Second test page" has the text "A page the reading page links to."
    And the page "Reading test page" has the text:
      """
      This page is the '''reading page''' of the test wiki. It has sections, a contents list, links and a reference.

      == Overview ==
      A wiki is a website that its readers edit together.<ref>Every page keeps its history.</ref>

      == Editing ==
      === Source editing ===
      The source editor shows the wikitext of a page.

      === Visual editing ===
      The visual editor shows the page as it looks.

      == Links ==
      * A page of the wiki: [[Second test page]]
      * A page that does not exist yet: [[Page not written yet]]
      * An external site: [https://example.org Example site]

      == References ==
      <references />

      [[Category:Test guides]]
      """

  @critical
  Scenario: A visitor reads the page with its sections in order
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then I should see the page "Reading test page"
    And the page text should contain "A wiki is a website that its readers edit together."
    And the page should have these sections in order:
      | section        | level |
      | Overview       | 2     |
      | Editing        | 2     |
      | Source editing | 3     |
      | Visual editing | 3     |
      | Links          | 2     |
      | References     | 2     |
    And the page should not have the section "History"
    And the scripts of the page should all load

  Scenario: The contents list leads to a section
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the contents list should list "Source editing"
    And the contents list should not list "History"
    When I follow "Links" in the contents list
    Then I should be at the section "Links"

  Scenario: The links of the page: a page, a page not written yet, an external site
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the page should link to the page "Second test page"
    And the page should link to the missing page "Page not written yet"
    And the page should not link to the page "Page not written yet"
    And the page should link to the external site "https://example.org"
    When I follow the link to the page "Second test page"
    Then I should see the page "Second test page"
    And the page text should contain "A page the reading page links to."

  Scenario: A reference leads to its note
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the reference "1" should read "Every page keeps its history."

  Scenario: The page lists its category, which lists the page
    Given I am an anonymous user
    When I open the page "Reading test page"
    Then the page should be in the category "Test guides"
    And the page should not be in the category "Drafts"
    When I follow the category "Test guides"
    Then I should see the page "Category:Test guides"
    And the category should list the page "Reading test page"
    And the category should not list the page "Second test page"
