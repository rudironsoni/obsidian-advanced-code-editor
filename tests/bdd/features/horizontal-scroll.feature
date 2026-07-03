@horizontal-scroll
Feature: Block-owned horizontal scroll

  Background:
    Given the built Shiki plugin is enabled in the fixture vault
    And the horizontal scroll fixture notes are reset

  @desktop
  Scenario: Reading mode keeps horizontal scroll inside one code block
    Given horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll single block.md" is open in reading mode for horizontal scroll
    When I scroll the first code block horizontally with its block scrollbar
    Then the active note should keep horizontal scroll inside the first code block
    And the surrounding note should not move horizontally

  @desktop
  Scenario: Live Preview keeps horizontal scroll inside the code block during an exact edit
    Given horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll single block.md" is open in Live Preview for horizontal scroll
    When I scroll the first code block horizontally with a wheel gesture
    And I edit the visible horizontal scroll marker
    Then the active note should keep horizontal scroll inside the first code block
    And the exact edit should be written at the horizontal scroll marker
    And the surrounding note should not move horizontally

  @desktop
  Scenario: Raw Source mode keeps Markdown editable while the block owns horizontal scroll
    Given horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll single block.md" is open in raw Source mode for horizontal scroll
    When I scroll the first code block horizontally with a Shift-wheel gesture
    Then raw Source mode should keep Markdown fences editable
    And the active note should keep horizontal scroll inside the first code block
    And the surrounding note should not move horizontally

  @desktop
  Scenario: Neighboring code blocks keep independent horizontal scroll positions
    Given horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll multi block.md" is open in Live Preview for horizontal scroll
    When I scroll the first code block horizontally with a wheel gesture
    Then the first and second code blocks should keep independent horizontal scroll positions
    And the surrounding note should not move horizontally

  @desktop
  Scenario: Wrapped code blocks do not require horizontal block scroll
    Given horizontal scroll settings use wrapping with line numbers
    And the fixture note "Horizontal scroll wrapped block.md" is open in Live Preview for horizontal scroll
    Then wrapped code blocks should not require horizontal block scroll
    And the surrounding note should not move horizontally

  @desktop
  Scenario: Live Preview repeated wheel scrolling remains responsive
    Given horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll stress block.md" is open in Live Preview for horizontal scroll
    When I repeatedly scroll the first code block horizontally with wheel gestures
    Then Live Preview horizontal scrolling should stay responsive
    And the active note should keep horizontal scroll inside the first code block
    And the surrounding note should not move horizontally

  @mobile
  Scenario: Mobile-emulated Live Preview touch gestures keep horizontal scroll inside the code block
    Given Obsidian is running in mobile emulation
    And horizontal scroll settings use nowrap with line numbers
    And the fixture note "Horizontal scroll single block.md" is open in Live Preview for horizontal scroll
    When I scroll the first code block horizontally with a touch gesture
    Then the active note should keep horizontal scroll inside the first code block
    And the surrounding note should not move horizontally
