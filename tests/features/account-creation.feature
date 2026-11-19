@account-creation
Feature: The account creation form refuses what it must
  As the owner of the wiki
  I want the account creation form to refuse a name in use and passwords that do not do
  So that nobody takes another person's name or a weak password

  # A suite never creates an account: the step sends the form only when the wiki will refuse it.

  Scenario: Two different passwords are refused
    Given I am an anonymous user
    When I try to create the account "Never created account" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-y"
    Then the account creation should be refused with "The passwords you entered do not match."
    And nobody should be logged in

  Scenario: A name in use is refused
    Given I am an anonymous user
    When I try to create the account "editor" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-x"
    Then the account creation should be refused with "Username entered already in use. Please choose a different name."

  Scenario: A short password is refused
    Given I am an anonymous user
    When I try to create the account "Never created account" with the password "abc" and the confirmation "abc"
    Then the account creation should be refused with "Passwords must be at least 8 characters."

  Scenario: A common password is refused
    Given I am an anonymous user
    When I try to create the account "Never created account" with the password "password1234" and the confirmation "password1234"
    Then the account creation should be refused with "The password entered is in a list of very commonly used passwords."
