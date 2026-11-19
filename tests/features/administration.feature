@administration
Feature: The administrator's pages
  As an administrator of the wiki
  I want to protect, delete and restore pages, and to block an account
  So that I can stop damage and repair it

  Scenario: A page protected for autoconfirmed users: the new account is refused, the confirmed editor is not
    Given the page "Protection test page" has the text "A page to protect."
    And I am a logged in user with the "administrator" user
    When I protect the page "Protection test page" so that only autoconfirmed users can edit it
    Then the page "Protection test page" should be protected so that only autoconfirmed users can edit it
    Given I am a logged in user with the "reader" user
    Then editing the page "Protection test page" should be refused with "This page has been protected to prevent editing or other actions."
    Given I am a logged in user with the "editor" user
    When I edit the page "Protection test page"
    And I add the wikitext "A line from a confirmed account."
    And I save the page with the summary "Edit of a protected page"
    Then the edit should be saved

  Scenario: A page protected for administrators refuses the editor, until the protection is removed
    Given the page "Protection test page" has the text "A page only administrators edit."
    And the page "Protection test page" is protected so that only administrators can edit it
    And I am a logged in user with the "editor" user
    Then editing the page "Protection test page" should be refused with "This page has been protected to prevent editing or other actions."
    Given I am a logged in user with the "administrator" user
    When I remove the protection of the page "Protection test page"
    Then the page "Protection test page" should not be protected

  Scenario: A page deleted and restored
    Given the page "Deletion test page" has the text "A page to delete and restore."
    And I am a logged in user with the "administrator" user
    When I delete the page "Deletion test page" with the reason "A test of the deletion"
    Then the page "Deletion test page" should not exist
    When I restore the page "Deletion test page" with the reason "A test of the restore"
    Then the page "Deletion test page" should exist
    When I open the page "Deletion test page"
    Then the page text should contain "A page to delete and restore."

  Scenario: A blocked account is refused editing until it is unblocked
    Given the page "Block test page" has the text "A page the blocked account tries to edit."
    And the account "reader" is not blocked
    And I am a logged in user with the "administrator" user
    When I block the account "reader" for "1 day" with the reason "A test of the block"
    Then the account "reader" should be blocked
    Given I am a logged in user with the "reader" user
    Then editing the page "Block test page" should be refused with "Your username or IP address has been blocked."
    Given I am a logged in user with the "administrator" user
    When I unblock the account "reader" with the reason "The test is over"
    Then the account "reader" should not be blocked
