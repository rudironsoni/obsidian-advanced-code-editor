@desktop
Feature: Plugin startup

  Scenario: Built plugin payload loads in Obsidian
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    Then the Advanced Code Editor plugin should be loaded from the built payload
