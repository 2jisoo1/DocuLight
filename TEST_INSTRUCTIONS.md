# Manual Test Instructions for DocLight

## 🚀 Quick Start

The server is currently running at: **http://localhost:3000**

---

## 📋 Step-by-Step Verification

### Step 1: Expand Guide Directory

**Action**: Click on the "📁 guide" item in the left sidebar

**Expected Result**:
```
Before:
▶ 📁 guide

After:
▼ 📁 guide
    📄 programming-samples.md
    📄 other-file.md
```

**What to Look For**:
- ✅ Arrow changes from ▶ to ▼
- ✅ Files appear indented below the directory
- ✅ Smooth expansion animation

---

### Step 2: Open programming-samples.md

**Action**: Click on "📄 programming-samples.md" in the sidebar

**Expected Result**:
- File content appears in the main content area (right side)
- Breadcrumb shows: `guide/programming-samples.md`
- File is highlighted in the sidebar (darker background)

---

### Step 3: Verify Syntax Highlighting

**What to Look For**: Code blocks should have **colors**, not plain white text

#### Python Code Block Example:
Look for the Python fibonacci function - it should appear like this:

```
Colored elements:
- ORANGE/RED: def, if, elif, return, for, in, range (keywords)
- BLUE: "Generate Fibonacci sequence up to n terms" (string)
- GRAY: # Python 예제: 피보나치 수열 (comment)
- PURPLE: fibonacci (function name)
- WHITE: n, i, fib (variables)
- BLUE: 0, 1, 2 (numbers)
```

**Visual Check**:
❌ BAD (no highlighting):
```
def fibonacci(n):
    if n <= 0:
        return []
```
All white/gray text = highlighting NOT working

✅ GOOD (with highlighting):
```
def fibonacci(n):    ← 'def' is ORANGE, 'fibonacci' is PURPLE
    if n <= 0:       ← 'if' is ORANGE, '0' is BLUE
        return []    ← 'return' is ORANGE
```
Different colors = highlighting IS working

---

### Step 4: Locate Copy Button

**Where**: Top-right corner of EACH code block

**What It Looks Like**:
```
┌─────────────────────────────────────┐
│ # Python example              [📋]│ ← Copy button here
│ def fibonacci(n):                   │
│     if n <= 0:                      │
│         return []                   │
└─────────────────────────────────────┘
```

**Visual Characteristics**:
- 📋 clipboard icon
- Semi-transparent white background
- Thin white border
- Positioned at top-right

**Hover Effect**:
- Background becomes brighter
- Border becomes more visible
- Cursor changes to pointer

---

### Step 5: Test Copy Functionality

**Action**: Click the 📋 button

**Expected Sequence**:

1. **Before Click**:
   ```
   [📋]
   ```

2. **After Click** (immediately):
   ```
   [📋 Copied!]
   ```
   - "Copied!" text appears
   - Text is fully visible (opacity: 1)

3. **After 3 Seconds**:
   ```
   [📋 Copied!]  → fading out (opacity: 1 → 0)
   ```
   - Message gradually disappears

4. **After Animation** (3.3 seconds):
   ```
   [📋]
   ```
   - Back to original state

**Verification**:
- Open any text editor
- Press Ctrl+V (Windows/Linux) or Cmd+V (Mac)
- Code should paste successfully

---

## 🎨 Expected Visual Appearance

### Full Page Layout
```
┌──────────────┬────────────────────────────────┐
│ 📁 guide     │ guide/programming-samples.md   │
│  ▼ guide     │                                │
│    📄 prog...│ # Programming Language Samples │
│              │                                │
│ [🔄 Refresh] │ ## Python              [📋]   │
│              │                                │
│              │ def fibonacci(n):      [📋]   │
│              │     ...                        │
│              │                                │
│              │ ## JavaScript          [📋]   │
│              │                                │
│              │ class UserService {    [📋]   │
│              │     ...                        │
└──────────────┴────────────────────────────────┘
  Sidebar          Main Content Area
  (200px)          (Remaining space)
```

---

## ✅ Success Criteria Checklist

Use this checklist to verify all features:

- [ ] **Directory Expansion**
  - [ ] Click expands/collapses directory
  - [ ] Arrow icon changes (▶ ↔ ▼)
  - [ ] Files appear indented

- [ ] **File Selection**
  - [ ] File content loads in main area
  - [ ] Breadcrumb updates correctly
  - [ ] File is highlighted in sidebar

- [ ] **Syntax Highlighting**
  - [ ] Python code has colors (keywords, strings, comments)
  - [ ] JavaScript code has colors
  - [ ] Keywords are distinctly colored (not all white)

- [ ] **Copy Button Display**
  - [ ] 📋 icon visible on ALL code blocks
  - [ ] Button positioned at top-right
  - [ ] Hover effect works (brightens on hover)

- [ ] **Copy Functionality**
  - [ ] Click copies code to clipboard
  - [ ] "Copied!" message appears
  - [ ] Message fades out after 3 seconds
  - [ ] Pasting works in text editor

---

## 🐛 Troubleshooting

### Issue: No Syntax Highlighting (All Code is White/Gray)

**Check**:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for errors related to "hljs" or "highlight"

**Possible Causes**:
- Highlight.js CDN failed to load
- JavaScript error preventing initialization

**Fix**:
- Refresh page (Ctrl+F5)
- Check internet connection (CDN resources)

---

### Issue: Copy Button Not Visible

**Check**:
1. Right-click on code block → Inspect
2. Look for `.copy-btn` element in HTML

**If missing**:
- Check Console for JavaScript errors
- Verify `addCopyButtons()` function ran

---

### Issue: "Copied!" Message Doesn't Appear

**Check**:
1. Click copy button
2. Open DevTools Console
3. Look for clipboard errors

**Possible Causes**:
- Browser doesn't support Clipboard API
- Page not served over HTTPS (localhost is OK)

---

## 📸 Screenshot Reference

Take screenshots at each step to document your verification:

1. **step1-guide-collapsed.png** - Before expanding guide directory
2. **step2-guide-expanded.png** - After expanding guide directory
3. **step3-file-loaded.png** - programming-samples.md loaded
4. **step4-syntax-highlighting.png** - Close-up of highlighted code
5. **step5-copy-button.png** - Copy button visible
6. **step6-copied-message.png** - After clicking copy button

---

## 🎯 Expected Code Colors (GitHub Dark Theme)

### Python
```python
def fibonacci(n):           # def=ORANGE, fibonacci=PURPLE
    """docstring"""         # docstring=LIGHT_BLUE
    if n <= 0:              # if=ORANGE, 0=BLUE
        return []           # return=ORANGE
```

### JavaScript
```javascript
class UserService {         // class=ORANGE, UserService=YELLOW
    async fetchUser(id) {   // async=ORANGE, fetchUser=PURPLE
        const url = "...";  // const=ORANGE, string=LIGHT_BLUE
        await fetch(url);   // await=ORANGE, fetch=PURPLE
    }
}
```

---

## 📊 Final Report Template

After testing, fill out this template:

```
DocLight Feature Test Report
Date: [Today's Date]
Browser: [Chrome/Firefox/Safari/Edge]
Version: [Browser Version]

✅ PASS / ❌ FAIL

1. Guide Directory Expansion:       [✅/❌]
2. File Selection (programming-samples.md): [✅/❌]
3. Syntax Highlighting Present:     [✅/❌]
4. Copy Button Visible:             [✅/❌]
5. Copy Functionality Works:        [✅/❌]
6. "Copied!" Message Appears:       [✅/❌]

Notes:
[Any issues or observations]

Screenshots:
[List screenshot filenames]
```

---

## 🚀 Quick Test (30 seconds)

If you just want to verify quickly:

1. Open http://localhost:3000
2. Click "guide" folder
3. Click "programming-samples.md"
4. Look for **colors** in code → Syntax highlighting ✅
5. Look for **📋 buttons** → Copy buttons ✅
6. Click a 📋 button → "Copied!" appears ✅

If all 3 work = **ALL FEATURES VERIFIED** 🎉
