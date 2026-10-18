# Project plan

```json
{
  "projectName": "Pixel Virtual Pet",
  "goal": "Build an offline browser app with a CSS-drawn pixel creature, hunger, happiness, and energy bars, and Feed/Play/Sleep controls that update bars and mood text using only HTML, CSS, and plain JavaScript.",
  "phases": [
    {
      "id": "p1",
      "name": "Foundation & Static Shell",
      "tasks": [
        "Create index.html and README.md with relative references",
        "Define a cohesive 3–5 color palette, system fonts, and 16px+ base styles",
        "Build centered card/game board layout and semantic control labels",
        "Add visible hover, focus, and pressed states for controls"
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p2",
      "name": "Pet Appearance & State UI",
      "tasks": [
        "Draw pixel creature using CSS box-shadow or grid with required IDs",
        "Add hunger, happiness, and energy bars with accessible labels",
        "Add mood text area with required ID",
        "Ensure layout works at 360px width"
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p3",
      "name": "Interactions & Game Logic",
      "tasks": [
        "Use addEventListener for Feed, Play, and Sleep buttons",
        "Implement state object for hunger, happiness, and energy",
        "Update bars and mood text based on state changes",
        "Clamp values to valid ranges and avoid network/external assets"
      ],
      "assignee": "JavaScript Developer",
      "priority": "high"
    },
    {
      "id": "p4",
      "name": "Accessibility, Polish & Verification",
      "tasks": [
        "Verify keyboard-accessible labeled controls and focus order",
        "Confirm no inline HTML handlers, imports, iframes, or server code",
        "Review responsive behavior from 360px and visual hierarchy",
        "Complete README with run instructions and build evidence"
      ],
      "assignee": "QA/Developer",
      "priority": "medium"
    }
  ],
  "estimatedRounds": 4,
  "risks": [
    "CSS-drawn creature may become complex and hurt code conciseness",
    "Misaligned control IDs or missing labels can violate acceptance criteria",
    "Responsive layout may break at 360px if spacing is not tested early",
    "Accidental use of inline event handlers or external references could invalidate offline constraint"
  ],
  "llmUsage": {
    "prompt_tokens": 408,
    "completion_tokens": 1674,
    "total_tokens": 2082
  },
  "llmModel": "deepseek-v4-pro",
  "llmProvider": "deepseek"
}
```
