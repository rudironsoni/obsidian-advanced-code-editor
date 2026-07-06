@desktop
Feature: Reading mode syntax highlighting

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

  Scenario: Reading mode proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in reading mode
    Then the syntax language matrix should have Shiki-owned token colors in reading

  Scenario: Live Preview proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview

  Scenario: Source Mode proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in raw Source mode
    Then the syntax language matrix should have Shiki-owned token colors in source

  Scenario: Live Preview keeps language-matrix Shiki tokens after sidebar layout changes
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
    When I collapse and expand the left sidebar
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
