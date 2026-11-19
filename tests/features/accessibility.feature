@accessibility
Feature: The pages of the wiki to assistive technology
  As a reader who uses a screen reader or a keyboard
  I want the wiki's pages to have their landmarks, a skip link and one main heading
  So that I can find my way through a page

  # The webship-js accessibility steps, on the wiki's pages.

  Scenario: A page has a main landmark, a skip link, one main heading and a language
    Given the page "Accessibility test page" has the text "A page for the accessibility checks."
    And I am an anonymous user
    When I open the page "Accessibility test page"
    Then the page should have a main landmark
    And the page should have a skip link
    And the page should have exactly one h1
    And the page should declare a language
