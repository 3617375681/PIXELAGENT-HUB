# Project plan

```json
{
  "projectName": "Pixel Tip Calculator",
  "goal": "Build an offline browser app that calculates tip amount and total per person from bill amount, tip percentage (10%, 15%, 20%), and number of people, using only HTML, CSS, and plain JavaScript with a polished pixel-art interface.",
  "phases": [
    {
      "id": "p1",
      "name": "Setup and Semantic Structure",
      "tasks": [
        "Create root index.html with linked style.css and script.js using relative paths",
        "Create README.md describing the app, file structure, and how to run it offline",
        "Build semantic markup for bill amount, tip percent buttons, number of people, tip output, and total per person",
        "Add accessible labeled controls and include empty addEventListener stubs"
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p2",
      "name": "Tip Calculation Logic",
      "tasks": [
        "Implement calculation for tip amount, total bill, and total per person",
        "Handle tip percentage buttons for 10%, 15%, and 20%",
        "Read bill amount and number of people inputs safely",
        "Update results on button clicks and input changes using addEventListener only",
        "Handle edge cases such as zero people, empty bill, or non-numeric input"
      ],
      "assignee": "Frontend Developer",
      "priority": "high"
    },
    {
      "id": "p3",
      "name": "Pixel Art Styling and Responsive Layout",
      "tasks": [
        "Create a centered card or game board on a themed background using CSS or canvas",
        "Apply a cohesive palette of 3-5 colors",
        "Use system fonts at 16px or larger with clear visual hierarchy and generous spacing",
        "Style hover, focus, and pressed states for all controls",
        "Ensure layout works from 360px wide without horizontal scrolling"
      ],
      "assignee": "UI Designer",
      "priority": "medium"
    },
    {
      "id": "p4",
      "name": "Validation, Polish, and Packaging",
      "tasks": [
        "Verify keyboard accessibility for all controls and focus indicators",
        "Confirm no imports, packages, network requests, external assets, iframes, or server code",
        "Test offline by opening index.html directly",
        "Polish README with build evidence and source archive notes",
        "Review final files use only .html, .css, .js, and .md extensions with relative paths"
      ],
      "assignee": "QA Tester",
      "priority": "medium"
    }
  ],
  "estimatedRounds": 4,
  "risks": [
    "Pixel art styling may be visually inconsistent across browsers without external assets",
    "Custom tip buttons may not meet keyboard accessibility expectations if focus states are incomplete",
    "Responsive layout may require extra tuning at 360px width",
    "Offline constraint means all visuals and functionality must be self-contained without network requests"
  ],
  "llmUsage": {
    "prompt_tokens": 409,
    "completion_tokens": 1106,
    "total_tokens": 1515
  },
  "llmModel": "deepseek-v4-pro",
  "llmProvider": "deepseek"
}
```
