@session
Feature: Logging in and out
  As a person with an account on the wiki
  I want to log in, see who I am, and log out
  So that my edits carry my name and nobody else uses my session

  # The accounts are the users registry of cucumber.js (administrator, editor, reader), made by the
  # build of the wiki; a scenario names an account by its handle and never writes a password.

  @critical
  Scenario Outline: The <account> account logs in through the login form
    Given I am an anonymous user
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | editor        |
      | reader        |

  Scenario: An account that logged in before takes its session over
    Given I am a logged in user with the "editor" user
    When I open the page "Main Page"
    Then I should be logged in as "editor"
    And I should not be logged in as "reader"

  Scenario: Keep me logged in
    Given I am an anonymous user
    When I log in as "reader" with the login form and ask to be kept logged in
    Then I should be logged in as "reader"

  Scenario: A wrong password is refused, with the message the wiki gives an unknown account too
    Given I am an anonymous user
    When I log in with the user name "No such account here" and the password "Wrong-password-1"
    Then the login should be refused with "Incorrect username or password entered. Please try again."
    And nobody should be logged in

  Scenario: Logging out ends the session
    Given I am a logged in user with the "reader" user
    When I log out
    Then I should not be logged in
    And I should see "You are now logged out."
