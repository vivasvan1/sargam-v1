# Implementation Plan - User Preferences & Light Mode

We will change the default theme to "light" and add a modal for user preferences.

## Proposed Changes

### [Frontend]
#### [MODIFY] [App.jsx](file:///Users/vivasvan.patel/Work/sargam-v1/frontend/src/App.jsx)
- Change `document.documentElement.classList.add('dark')` to allow for light mode by default.
- State management for theme (`light` | `dark`).
- Add `Settings` button and `PreferenceModal` component.

#### [MODIFY] [index.css](file:///Users/vivasvan.patel/Work/sargam-v1/frontend/src/index.css)
- Ensure base colors work well in light mode (verify against Radix/Tailwind defaults).

#### [NEW] [PreferenceModal.jsx](file:///Users/vivasvan.patel/Work/sargam-v1/frontend/src/PreferenceModal.jsx) [NEW]
- Create a reusable modal using `@radix-ui/react-dialog`.
- Include a theme toggle (Light/Dark).

## Verification Plan
### Automated Tests
- `bun run build` to verify production assets.

### Manual Verification
- Open the modal via the settings icon.
- Toggle between Light and Dark mode.
- Verify that "Light" is the initial state on fresh load.
