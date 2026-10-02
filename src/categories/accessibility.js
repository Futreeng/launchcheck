"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "accessibility",
  title: "Accessibility (WCAG 2.1 AA)",
  question: "Is the app accessible to users with disabilities (visual, hearing, motor, cognitive)? Does it meet WCAG 2.1 AA standards?",
  hunt: `
**Visual (blindness, low vision):**
- Screen reader support: All interactive elements (buttons, links, form fields) must have accessible names (text, aria-label, aria-labelledby).
- Images: Must have alt text describing content (not "image.png"). Decorative images use alt="".
- Color alone: Don't convey critical information with color only (e.g., red for error + text description).
- Text contrast: Minimum 4.5:1 for normal text, 3:1 for large text (18pt+). Check backgrounds vs foreground.
- No keyboard traps: Focus must be visible and able to move to all interactive elements (Tab, Shift+Tab).

**Hearing (deafness, hearing loss):**
- Audio/video: Must have captions (sync'd) and transcripts for audio content.
- Sound-only alerts: Must have visual fallback (e.g., icon, text change).
- Live chat/video: Real-time captions if audio is primary.

**Motor (mobility, tremors, limited dexterity):**
- Touch targets: Buttons/links must be 44x44 px minimum (WCAG recommendation).
- Keyboard accessible: Everything clickable must work via keyboard (no mouse-only interactions).
- Drag-and-drop: Must have keyboard alternative (e.g., cut/paste, arrow keys).
- Double-click: Avoid requiring double-click; provide single-click alternative.

**Cognitive (dyslexia, ADHD, low literacy):**
- Simple language: Jargon, acronyms explained on first use.
- Consistent navigation: Same menus/buttons in same place across pages.
- Clear labels: Form labels associated with inputs (not placeholder text alone).
- Error messages: Plain language, suggest how to fix (not just "Error 422").
- Focus indicators: Visible outline when focusing elements (outline: 2px solid).

**Structure & Semantics:**
- Headings: Use h1-h6 semantically (not for styling). One h1 per page. Nested hierarchy (h1 → h2 → h3).
- Lists: Use <ul>, <ol>, <li> for lists (not divs with role="listitem").
- Tables: <table>, <th>, <tr>, <td> with headers properly marked.
- Form fields: <label> properly associated via for/id (not floating labels).
- ARIA: Use sparingly; prefer semantic HTML. If used, must be correct (no aria-hidden on focusable elements).

**Automated checks (static):**
- Look for alt attributes on images (especially product/preview images).
- Check color contrast in CSS (flag low ratios).
- Scan for keyboard event handlers that don't have keyboard fallback (e.g., onclick without onkeydown).
- Look for focus styles in CSS (flag { outline: none; } without replacement).
- Check for skip links (jump to main content, bypass nav).`,
  probes: [
    {
      id: "keyboard-navigation",
      prompt: "Navigate the app using only Tab, Shift+Tab, Enter, Space, and arrow keys. Can you reach all buttons, links, form fields? Is focus always visible? Are there any keyboard traps?",
      timeout: 60,
    },
    {
      id: "mobile-touch-targets",
      prompt: "On mobile: tap each button/link. Are they at least 44x44px (thumb-sized)? Can you click them without hitting adjacent elements?",
      timeout: 45,
    },
    {
      id: "screen-reader-flow",
      prompt: "If a screen reader is available: turn it on and navigate the page. Does it read meaningful content and headings in logical order? Are alt texts present and useful?",
      timeout: 60,
    },
  ],
  artifacts: ["files", "routes"],
  stageWeights: [0.2, 0.6, 1.0, 1.5],
  typeFactor: { saas: 1.2, sdk: 1.0, internal: 0.5 },
  stageNotes: {
    concept: "Concept: accessibility nice-to-have, but flag if deliberately excluded.",
    pilot: "Pilot: basic accessibility (keyboard nav, alt text on key images).",
    beta: "Beta: WCAG 2.1 AA compliance expected for public use.",
    ga: "GA: full WCAG 2.1 AA required. Enterprise customers often audit this.",
  },
});
