@desktop
Feature: Reading mode syntax highlighting

  Scenario: A fenced code block renders Shiki highlighting
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Feature test.md" is open in reading mode
    When Obsidian renders the active note
    Then a visible Shiki code block should render "const wdioValue"

  Scenario: A C# fenced code block preserves full token source slices in Live Preview
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"

  Scenario: A C# fenced code block keeps Shiki highlighting in raw Source mode
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in raw Source mode
    Then raw Source mode should keep C# fenced code editable with Shiki token colors for "public sealed class Solution"

  Scenario: A C# Live Preview code block keeps Shiki colors after sidebar layout changes
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"
    When I collapse and expand the left sidebar
    Then the Live Preview code block should keep visible Shiki token colors for "public sealed class Solution"
