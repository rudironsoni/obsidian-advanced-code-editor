@desktop
Feature: Plugin startup

  Scenario: Built plugin payload loads in Obsidian
    Given the built Shiki plugin is enabled in the fixture vault
    Then the Shiki plugin should be loaded from the built payload
