@desktop
Feature: Plugin startup

  Scenario: Built plugin payload loads in Obsidian
    Given the built Advanced Code Block plugin is enabled in the fixture vault
    Then the Advanced Code Block plugin should be loaded from the built payload
