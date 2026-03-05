

## Plan: Mobile Project Detail Fixes (5 items)

This is a large set of changes, mostly in `ProjectDetailDialog.tsx`, plus a new "Fotky" document category and some global CSS tweaks.

---

### 1. Mobile Read-Only Mode with Edit Toggle

**What:** On mobile (< 768px), the detail sheet opens in read-only mode showing plain text values instead of inputs. An "✏️ Upravit" button in the header toggles to edit mode.

**How:**
- Add `mobileEditing` state (default `false`), and use `useIsMobile()` hook
- Compute `mobileReadOnly = isMobile && !mobileEditing`
- When `mobileReadOnly` is true, render all fields as styled `<span>` / `<p>` elements (label + value text) instead of `<Input>`, `<Select>`, `<PeopleSelectDropdown>`, `<DateField>`, etc.
- Create a `ReadOnlyField` helper: renders label + value as plain text with consistent styling
- In the `DialogHeader`, add a button area (mobile only):
  - Default: "✏️ Upravit" button → sets `mobileEditing = true`
  - Editing: "Uložit" (green) + "Zrušit" (gray) buttons
  - "Zrušit" resets form to `initialForm` and sets `mobileEditing = false`
  - "Uložit" calls `handleSave()` then sets `mobileEditing = false`
- Reset `mobileEditing = false` when dialog opens

---

### 2. Orange Highlight Touch Delay

**What:** Prevent accidental focus/highlight when scrolling past inputs on mobile.

**How:**
- Add global CSS in `index.css` for mobile: `-webkit-tap-highlight-color: transparent` on inputs/selects/buttons inside the dialog
- This is largely moot since read-only mode (#1) removes inputs, but for edit mode: add `touch-action: manipulation` and remove tap highlight on form elements at `max-width: 767px`

---

### 3. Move "Smazat projekt" on Mobile

**What:** Remove delete button from mobile footer; place it at the bottom of scrollable content.

**How:**
- Wrap the existing delete button block in the footer with `className="hidden md:flex"` (hide on mobile)
- At the end of the left panel content (after TPV section, ~line 1067), add a mobile-only delete section:
  - `<div className="md:hidden pt-8 pb-4 text-center">` with red text link "Smazat projekt" (12px)
  - On tap: opens `ConfirmDialog` with project name in the description
- Replace the "📸 Fotky" button in the mobile footer (see #4)

---

### 4. Add "📸 Fotky" — Camera Upload

**What:** New document category "Fotky" for photos, with a mobile footer camera button.

**Changes across files:**

**`src/hooks/useSharePointDocs.ts`:**
- Add `fotky: "Fotky"` to `CATEGORY_FOLDER_MAP`

**`src/components/ProjectDetailDialog.tsx`:**
- Add `{ key: "fotky", icon: "📷", label: "Fotky" }` to `DOC_CATEGORIES`
- Add a hidden `<input type="file" accept="image/*" capture="environment">` ref (`cameraInputRef`)
- Add "📸 Fotky" button in the mobile footer (replacing Smazat projekt position)
- On tap: triggers the camera input
- On file selected: uploads to SharePoint via `sp.uploadFile("fotky", file)` with filename `foto_{timestamp}.jpg`
- Show toast on success
- On desktop: the Fotky category appears in the document panel like other categories (no `capture` attribute, regular file browser)

**`supabase/functions/sharepoint-documents/index.ts`:**
- No changes needed — the function already handles arbitrary category folder names dynamically

---

### 5. Instant "Zavřít" Button

**What:** Remove close delay on mobile.

**How:**
- In `tryClose()`: if `!isDirty`, call `onOpenChange(false)` immediately (already the case)
- The perceived delay is likely from the dialog animation. Change the mobile dialog exit animation to 200ms by adding a Tailwind class override on the `DialogContent` for mobile: `max-md:data-[state=closed]:duration-200`
- Ensure no async operations run before `onOpenChange(false)` in the non-dirty path

---

### Files to modify:
1. **`src/components/ProjectDetailDialog.tsx`** — Main changes (read-only mode, edit toggle, delete relocation, camera button, close optimization)
2. **`src/hooks/useSharePointDocs.ts`** — Add "fotky" category
3. **`src/index.css`** — Add mobile tap-highlight suppression

