@upload
Feature: Uploading a file
  As an editor of the wiki
  I want to upload an image and be warned about a file the wiki has already
  So that pages can show images, without the same image twice

  Scenario: An editor uploads an image
    Given the page "File:Test square.png" does not exist
    And I am a logged in user with the "editor" user
    When I upload the file "tests/fixtures/blue-square.png" as "Test square.png" with the summary "A blue square" ignoring warnings
    Then I should see the file "Test square.png"
    And the page text should contain "A blue square"

  Scenario: The same image under another name is held back as a duplicate
    Given the file "Duplicate source square.png" is uploaded from "tests/fixtures/blue-square.png"
    And the page "File:Duplicate square.png" does not exist
    And I am a logged in user with the "editor" user
    When I upload the file "tests/fixtures/blue-square.png" as "Duplicate square.png"
    Then the upload should be held back with the warning "This file is a duplicate of the following file"
    And the page "File:Duplicate square.png" should not exist
