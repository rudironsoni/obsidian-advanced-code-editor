@mobile
Feature: Mobile-emulated syntax highlighting

  Scenario: A fenced code block renders while Obsidian is emulating mobile
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Feature test.md" is open in reading mode
    When Obsidian renders the active note
    Then a visible Shiki code block should render "const wdioValue"

  Scenario: A C# fenced code block preserves full token source slices in mobile Live Preview
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"
