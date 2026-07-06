@mobile
Feature: Mobile-emulated syntax highlighting

  Scenario: A C# fenced code block preserves full token source slices in mobile Live Preview
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"

  Scenario: A C# fenced code block keeps Shiki highlighting in mobile raw Source mode
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in raw Source mode
    Then raw Source mode should keep C# fenced code editable with Shiki token colors for "public sealed class Solution"

  Scenario: A C# Live Preview code block keeps Shiki colors after mobile sidebar layout changes
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"
    When I collapse and expand the left sidebar
    Then the Live Preview code block should keep visible Shiki token colors for "public sealed class Solution"

  Scenario: Mobile Reading mode proves Shiki-owned token colors across languages
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in reading mode
    Then the syntax language matrix should have Shiki-owned token colors in reading

  Scenario: Mobile Live Preview proves Shiki-owned token colors across languages
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview

  Scenario: Mobile Source Mode proves Shiki-owned token colors across languages
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in raw Source mode
    Then the syntax language matrix should have Shiki-owned token colors in source

  Scenario: Mobile Live Preview keeps language-matrix Shiki tokens after sidebar layout changes
    Given Obsidian is running in mobile emulation
    And the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
    When I collapse and expand the left sidebar
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
