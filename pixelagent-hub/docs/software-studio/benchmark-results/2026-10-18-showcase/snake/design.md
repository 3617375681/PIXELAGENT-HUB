# Project plan

```json
{
  "projectName": "Pixel Snake Game",
  "goal": "Build an offline, responsive browser-based snake game using HTML, CSS, and plain JavaScript with arrow-key controls, score, pause/resume, restart, and a game-over screen that starts paused and shows how to play.",
  "phases": [
    {
      "id": "p1",
      "name": "Setup and game board",
      "tasks": [
        "Create root index.html, styles.css, game.js, and README.md with relative paths.",
        "Define centered game board or canvas on themed background with a cohesive 3-5 color palette.",
        "Add semantic structure with labeled controls and accessible instructions."
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p2",
      "name": "Core game mechanics",
      "tasks": [
        "Implement snake movement with arrow key listeners.",
        "Add collision detection, food spawning, score tracking, and game loop.",
        "Render snake, food, and score using canvas or CSS pixel grid."
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p3",
      "name": "Game states and controls",
      "tasks": [
        "Implement start paused state with how-to-play overlay.",
        "Add pause/resume and restart controls with keyboard accessible labeled buttons.",
        "Show game-over screen with final score and restart action."
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p4",
      "name": "Styling and responsive polish",
      "tasks": [
        "Apply system fonts at 16px or larger and generous spacing.",
        "Add visible hover, focus, and pressed states on all controls.",
        "Ensure layout works from 360px wide and looks finished."
      ],
      "assignee": "UI Developer",
      "priority": "medium"
    },
    {
      "id": "p5",
      "name": "Verification and documentation",
      "tasks": [
        "Write README with run instructions, controls, and behavior notes.",
        "Verify no imports, packages, network requests, external assets, iframes, or server code.",
        "Test keyboard controls, pause/resume, restart, game-over flow, and responsive layout."
      ],
      "assignee": "QA Engineer",
      "priority": "medium"
    }
  ],
  "estimatedRounds": 4,
  "risks": [
    "Game loop timing may feel inconsistent across devices without requestAnimationFrame tuning.",
    "Keyboard focus and button control conflicts could interfere with arrow key movement.",
    "Canvas rendering may need fallback or adjustments for very small screens.",
    "Scope creep from adding extra features beyond required snake mechanics."
  ],
  "llmUsage": {
    "prompt_tokens": 406,
    "completion_tokens": 1626,
    "total_tokens": 2032
  },
  "llmModel": "deepseek-v4-pro",
  "llmProvider": "deepseek"
}
```
