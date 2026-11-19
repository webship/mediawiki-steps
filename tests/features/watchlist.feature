@watchlist
Feature: The watchlist and recent changes
  As an editor of the wiki
  I want to watch pages and see their changes
  So that I notice what happens to the pages I care about

  Background:
    Given the page "Watched test page" has the text "A page to watch." with the summary "A page to watch"

  Scenario: An editor watches a page and finds it on the watchlist
    Given I am a logged in user with the "editor" user
    When I open the page "Watched test page"
    And I watch the page
    Then I should be watching the page
    And my watchlist should list the page "Watched test page"
    And the watchlist should show a change to "Watched test page" with the summary "A page to watch"
    When I open the page "Watched test page"
    And I stop watching the page
    Then I should not be watching the page
    And my watchlist should not list the page "Watched test page"

  Scenario: Recent changes show a new page with its summary and author
    Given I am an anonymous user
    Then the recent changes should show a change to "Watched test page" with the summary "A page to watch" by "administrator"
