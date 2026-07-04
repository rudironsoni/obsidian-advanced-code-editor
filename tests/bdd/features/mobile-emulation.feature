@mobile
Feature: Mobile-emulated syntax highlighting

  Scenario: A fenced code block renders while Obsidian is emulating mobile
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Block plugin is enabled in the fixture vault
    And the fixture note "Feature test.md" is open in reading mode
    When Obsidian renders the active note
    Then a visible Shiki code block should render "const wdioValue"
