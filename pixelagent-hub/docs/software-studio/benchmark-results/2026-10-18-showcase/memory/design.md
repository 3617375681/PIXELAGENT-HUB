# Project plan

```json
{
  "projectName": "Pixel Memory-Match Game",
  "goal": "Build an offline browser memory-match game with 8 pairs of colored cards, flip-two-at-a-time matching, move counting, win message, and a New game button using only HTML, CSS, and plain JavaScript.",
  "phases": [
    {
      "id": "p1",
      "name": "Foundation & structure",
      "tasks": [
        "Create root index.html with centered game board container and accessible control regions",
        "Create styles.css with a cohesive 3-5 color palette and base layout",
        "Create script.js with DOMContentLoaded initialization",
        "Write README.md with project overview, run instructions, and keyboard usage"
      ],
      "assignee": "Developer",
      "priority": "high"
    },
    {
      "id": "p2",
      "name": "Core game logic",
      "tasks": [
        "Implement 8 pairs of colored cards and shuffle them on load",
        "Handle flipping two cards at a time and comparing matches",
        "Keep matched pairs open and reset non-matches after a short delay",
        "Track move count and detect win condition after all pairs are matched",
        "Show win message and implement New game button reset behavior"
      ],
      "assignee": "Developer",
      "priority": "high"
    },
    {
      "id": "p3",
      "name": "UI styling & responsive layout",
      "tasks": [
        "Style centered card/game board on a themed background",
        "Draw card graphics with CSS or canvas, including color pairs",
        "Add visible hover, focus, and pressed states for controls",
        "Ensure layout works from 360px wide using system fonts at 16px or larger",
        "Polish visual hierarchy, spacing, and finished appearance"
      ],
      "assignee": "UI Developer",
      "priority": "medium"
    },
    {
      "id": "p4",
      "name": "Accessibility, acceptance & final checks",
      "tasks": [
        "Add keyboard-accessible labeled controls and manage focus order",
        "Verify addEventListener is used instead of inline HTML event handlers",
        "Test offline browser behavior at desktop and mobile widths",
        "Confirm all file paths are relative and use .html, .css, .js, .md extensions",
        "Validate win message, move count, and New game button against acceptance criteria"
      ],
      "assignee": "QA/Developer",
      "priority": "high"
    }
  ],
  "estimatedRounds": 4,
  "risks": [
    "Rapid card clicks may cause state desynchronization or allow more than two flipped cards",
    "Styling could accidentally hide required card text, IDs, or keyboard focus indicators",
    "Responsive card sizing may fail at exactly 360px if dimensions are too rigid",
    "Keyboard accessibility may be missed without manual testing",
    "Keeping all graphics internal with CSS/canvas may increase implementation time"
  ],
  "llmUsage": {
    "prompt_tokens": 411,
    "completion_tokens": 1522,
    "total_tokens": 1933
  },
  "llmModel": "deepseek-v4-pro",
  "llmProvider": "deepseek"
}
```
