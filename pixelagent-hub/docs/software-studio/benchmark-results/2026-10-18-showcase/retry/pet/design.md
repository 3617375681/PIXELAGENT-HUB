# Project plan

```json
{
  "projectName": "Pixel Virtual Pet",
  "goal": "Build an offline browser-based pixel virtual pet with a CSS-drawn creature, hunger/happiness/energy bars, Feed/Play/Sleep controls, and dynamic mood text.",
  "phases": [
    {
      "id": "p1",
      "name": "Setup and layout",
      "tasks": [
        "Create root index.html, styles.css, app.js, and README.md with relative paths",
        "Build centered card layout with game board, title, stat bars, and buttons",
        "Add labeled Feed, Play, Sleep buttons and a mood status region",
        "Define a 3-5 color CSS palette and system fonts at 16px or larger"
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p2",
      "name": "CSS-drawn pixel creature",
      "tasks": [
        "Draw the pixel creature inside the card using CSS grid or box-shadow technique",
        "Add simple visual states or posture changes tied to mood",
        "Ensure the creature scales well on a 360px wide viewport"
      ],
      "assignee": "UI Developer",
      "priority": "high"
    },
    {
      "id": "p3",
      "name": "Core game logic",
      "tasks": [
        "Initialize hunger, happiness, and energy stats in a plain JavaScript object",
        "Create an update loop with gradual stat decay over time",
        "Wire Feed, Play, and Sleep controls using addEventListener",
        "Clamp stat values between 0 and 100 and update bar widths",
        "Derive and display mood text from stat thresholds"
      ],
      "assignee": "JavaScript Developer",
      "priority": "high"
    },
    {
      "id": "p4",
      "name": "Accessibility and polish",
      "tasks": [
        "Add visible hover, focus, and pressed states for all buttons",
        "Ensure keyboard-accessible labeled controls and aria-live status updates",
        "Refine responsive layout from 360px wide with generous spacing",
        "Apply cohesive background, card shadows, and visual hierarchy"
      ],
      "assignee": "Frontend Developer",
      "priority": "medium"
    },
    {
      "id": "p5",
      "name": "Documentation and review",
      "tasks": [
        "Write README.md with run instructions, controls, and feature list",
        "Verify no imports, packages, network requests, external assets, iframes, or server code",
        "Test at 360px width and with keyboard-only interaction",
        "Package source archive and build evidence"
      ],
      "assignee": "QA Developer",
      "priority": "medium"
    }
  ],
  "estimatedRounds": 5,
  "risks": [
    "CSS-drawn pixel creature may look inconsistent across browsers; use simple block shapes and cross-browser testing",
    "Stat decay timers could frustrate users; tune gradual decay and recovery rates",
    "Accessibility may be overlooked for a highly visual creature; keep controls semantic and status text clear",
    "Responsive design may conflict with pixel art; use flexible CSS grid and test at minimum width"
  ],
  "llmUsage": {
    "prompt_tokens": 408,
    "completion_tokens": 2008,
    "total_tokens": 2416
  },
  "llmModel": "deepseek-v4-pro",
  "llmProvider": "deepseek"
}
```
