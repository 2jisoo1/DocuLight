# Auto-Load Feature Test Report

**Test Date**: 2025-10-23
**Feature**: Last opened document auto-load after page refresh
**Test Method**: Playwright automated browser testing

---

## Test Summary

**Result**: ❌ **FAILED** - Auto-load feature is NOT working as expected

**Expected Behavior**:
- User opens a document (e.g., `guide/getting-started.md`)
- User refreshes the page or navigates to `http://localhost:3000`
- The previously opened document should automatically load
- Breadcrumb should show the file path
- File content should be displayed
- File tree item should be marked as active

**Actual Behavior**:
- Document path is correctly saved to IndexedDB ✓
- After refresh, the welcome screen is displayed instead of the document ✗
- Breadcrumb shows "문서를 선택하세요" (default) ✗
- No file content is loaded ✗
- No active state in file tree ✗

---

## Root Cause Analysis

### Issue Identification

The auto-load mechanism has the following workflow:

1. **Storage** (✓ Working):
   - `saveLastOpened()` correctly saves file path to IndexedDB
   - Data persists across page refreshes
   - Verified: `{key: 'file', path: 'guide/getting-started.md', ts: 1761207160401}`

2. **Retrieval** (✓ Working):
   - `getLastOpened()` correctly retrieves the saved path
   - Returns `'guide/getting-started.md'`

3. **Loading** (❌ **FAILING**):
   - `loadFile(lastOpened)` is called in `init()` function (line 497)
   - **Problem**: The file is inside a collapsed folder
   - The tree item element for `guide/getting-started.md` **does not exist in DOM**
   - Only root-level items are loaded initially
   - Nested items only appear after expanding parent folders

### Technical Details

**File Tree Structure**:
```
📁 Root (initially loaded)
  📁 guide (collapsed by default)
    📄 getting-started.md (NOT in DOM until 'guide' is expanded)
  📁 other-folders...
```

**Code Flow**:
```javascript
// app.js lines 493-504
const lastOpened = await getLastOpened(); // Returns 'guide/getting-started.md'
if (lastOpened) {
  try {
    await loadFile(lastOpened); // Attempts to load
  } catch (error) {
    console.warn('Failed to load last opened file:', error.message);
  }
}
```

**loadFile() function (lines 436-461)**:
```javascript
async function loadFile(path) {
  // Updates breadcrumb ✓
  document.getElementById('breadcrumb').textContent = path;

  // Fetches and renders content ✓
  const content = await fetchRaw(path);
  await renderMarkdown(content);

  // Tries to set active state ✗ (element doesn't exist)
  const activeItem = document.querySelector(`.tree-item[data-path="${path}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
  }

  // Saves to IndexedDB ✓
  await saveLastOpened(path);
}
```

### Why It's Failing

**The Problem**: Line 449-451 in `loadFile()`:
```javascript
const activeItem = document.querySelector(`.tree-item[data-path="${path}"]`);
if (activeItem) {
  activeItem.classList.add('active');
}
```

When `guide/getting-started.md` is loaded on init:
- The file **content loads successfully** (breadcrumb updates, markdown renders)
- BUT the tree item element doesn't exist because:
  - Only root-level tree is built initially
  - Child items are lazily loaded when folders are expanded
  - `guide` folder is collapsed, so `getting-started.md` element is not in DOM

**Evidence**:
```javascript
// Test result:
fileElementExists: false  // ← The tree item doesn't exist
fileElementVisible: false
activeFileElements: []    // ← No active state set
```

---

## Test Evidence

### Test Steps Executed

1. ✓ Navigate to `http://localhost:3000`
2. ✓ Click "guide" folder to expand
3. ✓ Click "getting-started.md" file
4. ✓ Verify file loaded (breadcrumb: "guide/getting-started.md")
5. ✓ Verify IndexedDB saved the path
6. ✓ Refresh page (navigate to `http://localhost:3000` again)
7. ✓ Wait 2-5 seconds for auto-load
8. ❌ **Expected**: File auto-loads
9. ❌ **Actual**: Welcome screen displayed

### IndexedDB State

**After First Load**:
```json
{
  "key": "file",
  "path": "guide/getting-started.md",
  "ts": 1761207160401
}
```

**After Refresh** (persisted correctly):
```json
{
  "key": "file",
  "path": "guide/getting-started.md",
  "ts": 1761207160401
}
```

### DOM State After Refresh

```javascript
{
  breadcrumb: "문서를 선택하세요",
  lastOpenedInDB: {
    key: 'file',
    path: 'guide/getting-started.md',
    ts: 1761207160401
  },
  fileElementExists: false,    // ← Tree item not in DOM
  fileElementVisible: false,
  activeFileElements: []       // ← No active state
}
```

### Console Logs

**No errors or warnings captured** during auto-load attempt. The code appears to execute but fails silently because:
- The try-catch block at line 498 catches any errors
- Error is logged with `console.warn()` but test showed no such logs
- This suggests `loadFile()` might be succeeding partially (fetching content) but not failing hard

---

## Proposed Solution

To fix this issue, the auto-load logic needs to:

1. **Parse the file path** to identify parent folders
2. **Expand all parent folders** in the tree before loading the file
3. **Wait for DOM elements** to be created
4. **Then load the file** with active state

### Implementation Approach

Add a new function to expand parent folders:

```javascript
async function expandPathToFile(filePath) {
  const parts = filePath.split('/');
  const fileName = parts.pop();
  let currentPath = '';

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const wrapper = document.querySelector(`.tree-item-wrapper[data-path="${currentPath}"]`);

    if (wrapper) {
      const childrenContainer = wrapper.querySelector('.tree-children');
      const expandIcon = wrapper.querySelector('.expand-icon');

      if (childrenContainer.style.display === 'none') {
        await toggleDirectory(currentPath, wrapper, childrenContainer, expandIcon, parts.indexOf(part) + 1);
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for DOM update
      }
    }
  }
}
```

Then modify the init() function:

```javascript
// Load last opened file if exists
const lastOpened = await getLastOpened();
if (lastOpened) {
  try {
    await expandPathToFile(lastOpened); // ← Expand parent folders first
    await loadFile(lastOpened);
  } catch (error) {
    console.warn('Failed to load last opened file:', error.message);
  }
}
```

---

## Screenshots

- `screenshot_before_refresh.png`: File loaded correctly before refresh
- `screenshot_after_refresh.png`: Welcome screen shown after refresh (bug)
- `screenshot_debug.png`: Diagnostic screenshot showing DOM state

---

## Recommendations

1. **Fix Priority**: High - This is a core UX feature
2. **Implementation**: Implement `expandPathToFile()` helper function
3. **Testing**: Add automated tests for nested file auto-load
4. **Edge Cases**: Handle cases where parent folders might not exist
5. **User Feedback**: Consider showing a loading indicator during auto-load

---

## Conclusion

The auto-load feature has the storage and retrieval mechanisms working correctly, but fails to load files that are nested inside collapsed folders. The fix requires expanding parent folders before attempting to load the file and set its active state in the tree.

**Status**: 🔴 Bug Confirmed - Ready for Implementation
