# API-Sports Widgets v3 Documentation Reference

This file serves as a local reference for integrating and managing API-Sports client-side widgets.

*   **Official Documentation Link**: [https://api-sports.io/documentation/widgets/v3](https://api-sports.io/documentation/widgets/v3)
*   **Widget Script Source**: `https://widgets.api-sports.io/3.1.0/widgets.js`

---

## 1. Global Setup

To use the widgets, you must load the `widgets.js` script (preferably as a module) and include a single global configuration element at the root level of your HTML document:

### Script Loader ([index.html](file:///c:/Users/Admin/Documents/GitHub/bettorsedge/index.html))
```html
<script type="module" src="https://widgets.api-sports.io/3.1.0/widgets.js"></script>
```

### Global Config Widget
```html
<api-sports-widget 
    data-type="config" 
    data-key="YOUR_API_KEY"
    data-theme="grey"
    data-timezone="CST"
    data-show-errors="true"
    data-show-logos="true"
    data-favorite="true"
></api-sports-widget>
```

---

## 2. Content Widgets (Baseball / MLB)

To render sports content, place the corresponding `api-sports-widget` element in your DOM. The widgets support attributes that inherit from the global config or can be overridden locally.

### A. Game Detail Widget
Used to display score details, stats, lineups, and live plays for a specific game:
```html
<api-sports-widget
    data-type="game"
    data-game-id="GAME_ID"
    data-sport="baseball"
    data-refresh="30"
    data-show-toolbar="true"
    data-tab="all"
    data-game-style="2"
></api-sports-widget>
```

### B. Head-to-Head (H2H) Matchup History
Displays historical matchup results and statistics between two teams:
```html
<api-sports-widget
    data-type="h2h"
    data-h2h="TEAM_ID_1-TEAM_ID_2"
    data-sport="baseball"
    data-refresh="30"
    data-show-toolbar="true"
    data-tab="all"
    data-h2h-style="2"
></api-sports-widget>
```

---

## 3. Dynamic Lifecycle & React Integration

### The Issue
By default, `widgets.js` relies on a one-time scan during `DOMContentLoaded` and a global `MutationObserver` on `document.body` to initialize new widgets. 
The observer only checks the top-level `addedNodes` of any mutation record. If a React component dynamically mounts and inserts a widget wrapped inside a container (e.g. `<div class="space-y-4">`), the observer only sees the `div`, misses the nested `<api-sports-widget>`, and leaves the widget blank.

### The Fix
To support dynamic client-side rendering (such as routing and tab switches), we manually initialize the custom elements upon insertion. This is handled inside our [ApiSportsWidgetEmbed](file:///c:/Users/Admin/Documents/GitHub/bettorsedge/src/components/ApiSportsWidgets.tsx#L11-L51) wrapper component in [ApiSportsWidgets.tsx](file:///c:/Users/Admin/Documents/GitHub/bettorsedge/src/components/ApiSportsWidgets.tsx):

```typescript
// Query the custom element and manually initialize it if it hasn't been upgraded yet
const widgets = containerRef.current.querySelectorAll("api-sports-widget:not([data-type='config'])");
widgets.forEach((widget: any) => {
  if (typeof widget.initSequential === "function") {
    if (!widget.classList.contains("initialized")) {
      widget.initSequential();
    }
  } else {
    // Wait for widgets.js script to load and register the custom element
    customElements.whenDefined("api-sports-widget").then(() => {
      if (typeof widget.initSequential === "function" && !widget.classList.contains("initialized")) {
        widget.initSequential();
      }
    });
  }
});
```
