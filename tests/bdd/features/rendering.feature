@desktop
Feature: Reading mode syntax highlighting

  @language-less
  Scenario: A language-less fenced block uses Advanced Code Editor in Reading mode and Live Preview
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Language-less code block.md" is open in reading mode
    Then the language-less code block should use Advanced Code Editor in reading
    When the fixture note "Language-less code block.md" is open in Live Preview
    Then the language-less code block should use Advanced Code Editor in live-preview
    When the fixture note "Language-less code block.md" is open in raw Source mode
    Then the language-less code block should use Advanced Code Editor in source

  @multiple-language-less
  Scenario: Multiple language-less blocks all use Advanced Code Editor after switching from Reading mode to Live Preview
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Multiple language-less code blocks.md" is open in reading mode
    Then all mixed code blocks should use Advanced Code Editor in Reading mode
    When the fixture note "Multiple language-less code blocks.md" is open in Live Preview
    Then all three language-less code blocks should use Advanced Code Editor in Live Preview

  @reading-lines
  Scenario: A C# fenced code block renders in Reading mode without Markdown fences
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp padded reading.md" is open in reading mode
    Then a visible Shiki code block should render "List<int[]> intervals"
    And Reading mode should color repeated C# generic type names consistently
    And Reading mode should render one visual row per source line

  @reading-multiple-blocks
  Scenario: Multiple C# blocks in one note all use Advanced Code Editor in Reading mode
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Multiple reading code blocks.md" is open in reading mode
    Then both Reading mode code blocks should use Advanced Code Editor

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

  @copy-controls @visual-parity
  Scenario: Reading mode copy control writes code and keeps stable states
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp padded reading.md" is open in reading mode
    Then a visible Shiki code block should render "List<int[]> intervals"
    And the rendered copy control should copy "List<int[]> intervals" and keep stable states in reading

  @copy-controls @visual-parity
  Scenario: Live Preview copy control writes code and keeps stable states
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "CSharp token slicing.md" is open in Live Preview
    Then the Live Preview code block should style the full source text "// Define constants for start and end indices"
    And the rendered copy control should copy "public sealed class Solution" and keep stable states in live-preview

  @visual-parity
  Scenario: Reading mode proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in reading mode
    Then the syntax language matrix should have Shiki-owned token colors in reading

  @visual-parity
  Scenario: Live Preview proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview

  @visual-parity
  Scenario: Source Mode proves Shiki-owned token colors across languages
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in raw Source mode
    Then the syntax language matrix should have Shiki-owned token colors in source

  @visual-parity
  Scenario: Live Preview keeps language-matrix Shiki tokens when note focus is lost
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
    When I move focus away from the note
    Then the syntax language matrix should have Shiki-owned token colors in live-preview

  @visual-parity
  Scenario: Source Mode keeps language-matrix Shiki tokens and theme background when note focus is lost
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in raw Source mode
    Then the syntax language matrix should have Shiki-owned token colors in source
    When I move focus away from the note
    Then the syntax language matrix should have Shiki-owned token colors in source
    And raw Source mode background should match the selected Shiki theme

  @theme-confidence @visual-parity
  Scenario: Settings show theme confidence and valid custom theme folders
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And theme confidence settings use a valid custom theme folder
    Then the theme settings should show active theme confidence and custom theme validation

  @language-support @visual-parity
  Scenario: Settings show language support validation backed by the syntax matrix
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And language support settings use validation fixtures
    Then the language settings should show disabled-language and custom-language validation

  @theme-confidence @visual-parity
  Scenario: Theme backgrounds match the selected Shiki theme in every desktop render mode
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in reading mode
    Then the syntax language matrix should have Shiki-owned token colors in reading
    And the Shiki theme background should match in reading
    When the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
    And the Shiki theme background should match in live-preview
    When the fixture note "Syntax language matrix.md" is open in raw Source mode
    Then the syntax language matrix should have Shiki-owned token colors in source
    And the Shiki theme background should match in source

  @metadata-parity @visual-parity
  Scenario: Reading mode and Live Preview render metadata consistently with nowrap defaults
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And code block defaults hide line numbers and do not wrap
    And the fixture note "Metadata parity.md" is open in reading mode
    Then code block metadata should render consistently in reading
    When the fixture note "Metadata parity.md" is open in Live Preview
    Then code block metadata should render consistently in live-preview

  @metadata-parity @visual-parity
  Scenario: Reading mode and Live Preview render metadata consistently with wrapped defaults
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And code block defaults show line numbers and wrap
    And the fixture note "Metadata parity.md" is open in reading mode
    Then wrapped code block metadata should render consistently in reading
    When the fixture note "Metadata parity.md" is open in Live Preview
    Then wrapped code block metadata should render consistently in live-preview

  @visual-parity
  Scenario: Live Preview keeps language-matrix Shiki tokens after sidebar layout changes
    Given the built Advanced Code Editor plugin is enabled in the fixture vault
    And the fixture note "Syntax language matrix.md" is open in Live Preview
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
    When I collapse and expand the left sidebar
    Then the syntax language matrix should have Shiki-owned token colors in live-preview
