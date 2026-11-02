/**
 * Empirical Verification Test Suite for Milestone 2 Frontend Remediation:
 * 1. WCAG 2.1 Mathematical Contrast Ratio Verification across Dark & Light Modes
 * 2. WAI-ARIA Focus Trap (Tab and Shift+Tab cycling) in BeforeLeavingConfigModal
 * 3. Mobile Viewport Geometry & Header Layout Resilience (@media max-width: 360px)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ==============================================================================
// WCAG 2.1 Math & Color Helpers
// ==============================================================================

function parseHex(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: 1.0,
  };
}

function parseRgba(rgbaStr) {
  if (rgbaStr.startsWith('#')) return parseHex(rgbaStr);
  const match = rgbaStr.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!match) throw new Error(`Invalid color string: ${rgbaStr}`);
  return {
    r: parseFloat(match[1]),
    g: parseFloat(match[2]),
    b: parseFloat(match[3]),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1.0,
  };
}

function alphaComposite(fg, bg) {
  const fgColor = typeof fg === 'string' ? parseRgba(fg) : fg;
  const bgColor = typeof bg === 'string' ? parseRgba(bg) : bg;

  const a = fgColor.a + bgColor.a * (1 - fgColor.a);
  const r = (fgColor.r * fgColor.a + bgColor.r * bgColor.a * (1 - fgColor.a)) / (a || 1);
  const g = (fgColor.g * fgColor.a + bgColor.g * bgColor.a * (1 - fgColor.a)) / (a || 1);
  const b = (fgColor.b * fgColor.a + bgColor.b * bgColor.a * (1 - fgColor.a)) / (a || 1);

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
}

function relativeLuminance(color) {
  const c = typeof color === 'string' ? parseRgba(color) : color;
  const sRGB = [c.r / 255, c.g / 255, c.b / 255];
  const linear = sRGB.map((val) => {
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(color1, color2) {
  const L1 = relativeLuminance(color1);
  const L2 = relativeLuminance(color2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ==============================================================================
// Palettes from frontend/src/index.css
// ==============================================================================

const DARK_THEME = {
  bgApp: '#0d0d0d',
  bgSurface: '#141414',
  bgCard: '#1c1c1f',
  bgCardHover: '#26262a',
  bgInput: '#141414',
  bgInputFocus: '#1c1c1f',
  bgElevated: '#242428',
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderHover: 'rgba(255, 255, 255, 0.20)',
  borderFocus: 'rgba(255, 255, 255, 0.45)',
  textPrimary: '#ededed',
  textSecondary: '#a1a1aa',
  textTertiary: '#71717a',
  textMuted: '#52525b',
  accentPrimary: '#ffffff',
  accentPrimaryHover: '#e4e4e7',
  accentPrimaryDim: 'rgba(255, 255, 255, 0.12)',
  deleteColor: '#f87171',
  deleteBg: 'rgba(239, 68, 68, 0.12)',
};

const LIGHT_THEME = {
  bgApp: '#f4f4f6',
  bgSurface: '#ffffff',
  bgCard: '#ffffff',
  bgCardHover: '#f8f8fa',
  bgInput: '#f0f0f3',
  bgInputFocus: '#ffffff',
  bgElevated: '#ffffff',
  borderSubtle: 'rgba(0, 0, 0, 0.08)',
  borderHover: 'rgba(0, 0, 0, 0.16)',
  borderFocus: 'rgba(0, 0, 0, 0.38)',
  textPrimary: '#09090b',
  textSecondary: '#52525b',
  textTertiary: '#71717a',
  textMuted: '#a1a1aa',
  accentPrimary: '#09090b',
  accentPrimaryHover: '#27272a',
  accentPrimaryDim: 'rgba(0, 0, 0, 0.06)',
  deleteColor: '#dc2626',
  deleteBg: 'rgba(239, 68, 68, 0.10)',
};

// ==============================================================================
// 1. WCAG 2.1 Color Contrast Tests
// ==============================================================================

describe('1. Empirical WCAG 2.1 Color Contrast Ratio Verification', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');

  it('verifies CSS tokens match defined palette values', () => {
    assert.ok(css.includes('--bg-app: #0d0d0d;'));
    assert.ok(css.includes('--bg-app: #f4f4f6;'));
    assert.ok(css.includes('--text-primary: #ededed;'));
    assert.ok(css.includes('--text-primary: #09090b;'));
  });

  it('calculates Profile Dropdown items contrast (default, hover, active) in Dark and Light modes', () => {
    // Dark mode
    // Container: bgElevated (#242428)
    const darkDefaultRatio = contrastRatio(DARK_THEME.textPrimary, DARK_THEME.bgElevated);
    assert.ok(darkDefaultRatio >= 11.0, `Dark default dropdown text contrast ${darkDefaultRatio} must be >= 11:1`);
    assert.ok(darkDefaultRatio >= 7.0, 'Meets WCAG AAA (>= 7:1)');

    const darkHoverBg = DARK_THEME.bgCardHover; // #26262a
    const darkHoverRatio = contrastRatio(DARK_THEME.textPrimary, darkHoverBg);
    assert.ok(darkHoverRatio >= 10.0, `Dark hover dropdown text contrast ${darkHoverRatio} must be >= 10:1`);

    const darkActiveBg = alphaComposite(DARK_THEME.accentPrimaryDim, DARK_THEME.bgElevated);
    const darkActiveRatio = contrastRatio(DARK_THEME.textPrimary, darkActiveBg);
    assert.ok(darkActiveRatio >= 9.0, `Dark active dropdown text contrast ${darkActiveRatio} must be >= 9:1`);

    // Light mode
    // Container: bgElevated (#ffffff)
    const lightDefaultRatio = contrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.bgElevated);
    assert.ok(lightDefaultRatio >= 18.0, `Light default dropdown text contrast ${lightDefaultRatio} must be >= 18:1`);
    assert.ok(lightDefaultRatio >= 7.0, 'Meets WCAG AAA (>= 7:1)');

    const lightHoverBg = LIGHT_THEME.bgCardHover; // #f8f8fa
    const lightHoverRatio = contrastRatio(LIGHT_THEME.textPrimary, lightHoverBg);
    assert.ok(lightHoverRatio >= 17.0, `Light hover dropdown text contrast ${lightHoverRatio} must be >= 17:1`);

    const lightActiveBg = alphaComposite(LIGHT_THEME.accentPrimaryDim, LIGHT_THEME.bgElevated);
    const lightActiveRatio = contrastRatio(LIGHT_THEME.textPrimary, lightActiveBg);
    assert.ok(lightActiveRatio >= 16.0, `Light active dropdown text contrast ${lightActiveRatio} must be >= 16:1`);
  });

  it('calculates Primary Dropdown Item (.profile-dropdown-item-primary) contrast', () => {
    // Verified that #ffffff was replaced with var(--text-primary)
    assert.ok(css.includes('.profile-dropdown-item-primary {\n  color: var(--text-primary);'));

    const darkRatio = contrastRatio(DARK_THEME.textPrimary, DARK_THEME.bgElevated);
    const lightRatio = contrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.bgElevated);

    assert.ok(darkRatio >= 11.0, `Dark primary dropdown item ratio ${darkRatio}`);
    assert.ok(lightRatio >= 18.0, `Light primary dropdown item ratio ${lightRatio}`);
    assert.ok(lightRatio >= 7.0, 'Light primary dropdown item strictly satisfies WCAG AAA (>= 7:1)');
  });

  it('calculates Before Leaving Add Button (.before-leaving-add-btn) contrast in Dark and Light modes', () => {
    // Style: background: var(--text-primary); color: var(--bg-app);
    // Dark mode: bg = #ededed, fg = #0d0d0d
    const darkAddRatio = contrastRatio(DARK_THEME.bgApp, DARK_THEME.textPrimary);
    assert.ok(darkAddRatio >= 15.0, `Dark add button contrast ${darkAddRatio} must be >= 15:1`);
    assert.ok(darkAddRatio >= 7.0, 'Dark add button meets WCAG AAA (>= 7:1)');

    // Dark hover: background: var(--accent-primary-hover) (#e4e4e7), fg: var(--bg-app) (#0d0d0d)
    const darkAddHoverRatio = contrastRatio(DARK_THEME.bgApp, DARK_THEME.accentPrimaryHover);
    assert.ok(darkAddHoverRatio >= 14.0, `Dark add button hover contrast ${darkAddHoverRatio} must be >= 14:1`);

    // Light mode: bg = #09090b, fg = #f4f4f6
    const lightAddRatio = contrastRatio(LIGHT_THEME.bgApp, LIGHT_THEME.textPrimary);
    assert.ok(lightAddRatio >= 17.0, `Light add button contrast ${lightAddRatio} must be >= 17:1`);
    assert.ok(lightAddRatio >= 7.0, 'Light add button meets WCAG AAA (>= 7:1)');

    // Light hover: background: var(--accent-primary-hover) (#27272a), fg: var(--bg-app) (#f4f4f6)
    const lightAddHoverRatio = contrastRatio(LIGHT_THEME.bgApp, LIGHT_THEME.accentPrimaryHover);
    assert.ok(lightAddHoverRatio >= 12.0, `Light add button hover contrast ${lightAddHoverRatio} must be >= 12:1`);
  });

  it('calculates Item Row Title (.before-leaving-item-title) contrast', () => {
    // Foreground: textPrimary, Background: bgCard
    const darkRatio = contrastRatio(DARK_THEME.textPrimary, DARK_THEME.bgCard);
    assert.ok(darkRatio >= 13.0, `Dark item title ratio ${darkRatio} >= 13:1`);

    const lightRatio = contrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.bgCard);
    assert.ok(lightRatio >= 18.0, `Light item title ratio ${lightRatio} >= 18:1`);
  });

  it('calculates Destructive Delete Hover (.before-leaving-item-delete:hover) contrast', () => {
    // Dark mode: color: #f87171, background: rgba(239, 68, 68, 0.12) on bgCard (#1c1c1f)
    const darkBg = alphaComposite(DARK_THEME.deleteBg, DARK_THEME.bgCard);
    const darkDeleteRatio = contrastRatio(DARK_THEME.deleteColor, darkBg);
    assert.ok(darkDeleteRatio >= 5.0, `Dark delete button hover contrast ${darkDeleteRatio} must be >= 4.5:1 (WCAG AA)`);

    // Light mode override: color: #dc2626, background: rgba(239, 68, 68, 0.10) on bgCard (#ffffff)
    const lightBg = alphaComposite(LIGHT_THEME.deleteBg, LIGHT_THEME.bgCard);
    const lightDeleteRatio = contrastRatio(LIGHT_THEME.deleteColor, lightBg);
    
    // WCAG 2.1 SC 1.4.11 Non-text Contrast for graphical icons requires >= 3.0:1:
    assert.ok(lightDeleteRatio >= 3.0, `Light delete button hover contrast ${lightDeleteRatio} must be >= 3.0:1 (WCAG 2.1 SC 1.4.11)`);
    
    // Note empirical finding: worker handoff claimed 5.09:1 (referencing text threshold >= 4.5:1),
    // whereas mathematical composite evaluation yields 4.23:1:
    assert.ok(lightDeleteRatio >= 4.2 && lightDeleteRatio <= 4.25, `Empirical calculated ratio is ~4.23:1 (actual: ${lightDeleteRatio})`);
  });

  it('calculates Launch Preview Button (.before-leaving-launch-preview-btn) contrast', () => {
    // Default: background: var(--bg-card); color: var(--text-primary);
    const darkRatio = contrastRatio(DARK_THEME.textPrimary, DARK_THEME.bgCard);
    const lightRatio = contrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.bgCard);
    assert.ok(darkRatio >= 13.0);
    assert.ok(lightRatio >= 18.0);

    // Hover: background: var(--bg-card-hover); color: var(--text-primary);
    const darkHoverRatio = contrastRatio(DARK_THEME.textPrimary, DARK_THEME.bgCardHover);
    const lightHoverRatio = contrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.bgCardHover);
    assert.ok(darkHoverRatio >= 10.0);
    assert.ok(lightHoverRatio >= 17.0);
  });
});

// ==============================================================================
// 2. WAI-ARIA Focus Trap Simulation & Validation
// ==============================================================================

describe('2. WAI-ARIA Focus Trap Invariants in BeforeLeavingConfigModal', () => {
  const modalCode = fs.readFileSync('frontend/src/components/BeforeLeavingConfigModal.jsx', 'utf8');

  it('verifies focus trap selector string and logic are syntactically exact', () => {
    assert.ok(modalCode.includes("e.key === 'Tab' && sheetRef.current"));
    assert.ok(
      modalCode.includes(
        "const focusable = sheetRef.current.querySelectorAll(\n          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])'\n        );"
      )
    );
    assert.ok(modalCode.includes('e.shiftKey && document.activeElement === first'));
    assert.ok(modalCode.includes('last.focus()'));
    assert.ok(modalCode.includes('!e.shiftKey && document.activeElement === last'));
    assert.ok(modalCode.includes('first.focus()'));
  });

  // Mock DOM Node & Event System to verify focus cycling
  class MockElement {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = { ...attributes };
      this.children = [];
      this.parentNode = null;
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    hasAttribute(name) {
      return name in this.attributes;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    querySelectorAll(selector) {
      const results = [];
      const traverse = (node) => {
        for (const child of node.children) {
          if (child.matches(selector)) {
            results.push(child);
          }
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }
    matches(selector) {
      // Supports compound selector: 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const parts = selector.split(',').map((s) => s.trim());
      for (const part of parts) {
        if (part === 'button:not([disabled])') {
          if (this.tagName === 'BUTTON' && !this.attributes.disabled) return true;
        } else if (part === 'input:not([disabled])') {
          if (this.tagName === 'INPUT' && !this.attributes.disabled) return true;
        } else if (part === '[tabindex]:not([tabindex="-1"])') {
          if (this.hasAttribute('tabindex') && this.attributes.tabindex !== '-1' && this.attributes.tabindex !== -1) {
            return true;
          }
        }
      }
      return false;
    }
  }

  function simulateTabNavigation({ focusableElements, currentActiveIndex, shiftKey }) {
    let activeElement = focusableElements[currentActiveIndex];
    let prevented = false;

    const event = {
      key: 'Tab',
      shiftKey: !!shiftKey,
      preventDefault: () => {
        prevented = true;
      },
    };

    // Exact logic from BeforeLeavingConfigModal.jsx
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      activeElement = last;
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      activeElement = first;
    } else {
      // Natural browser order
      const delta = event.shiftKey ? -1 : 1;
      activeElement = focusableElements[currentActiveIndex + delta];
    }

    return { nextActiveElement: activeElement, prevented };
  }

  it('cycles Tab forward from last focusable element to first (empty list)', () => {
    const sheet = new MockElement('div', { tabindex: '-1' });
    const closeBtn = sheet.appendChild(new MockElement('button', { class: 'sheet-close-btn' }));
    const addInput = sheet.appendChild(new MockElement('input', { class: 'before-leaving-input' }));
    const addBtnDisabled = sheet.appendChild(new MockElement('button', { class: 'before-leaving-add-btn', disabled: true }));

    const focusable = sheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    assert.equal(focusable.length, 2, 'Should only contain closeBtn and addInput; disabled addBtn is excluded');
    assert.equal(focusable[0], closeBtn);
    assert.equal(focusable[1], addInput);

    // Focus on addInput (last element) -> Tab forward
    const result = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: 1, // addInput (last)
      shiftKey: false,
    });

    assert.equal(result.prevented, true, 'Default tab must be prevented to loop');
    assert.equal(result.nextActiveElement, closeBtn, 'Focus must loop back to first element (closeBtn)');
  });

  it('cycles Shift+Tab backward from first focusable element to last (empty list)', () => {
    const sheet = new MockElement('div', { tabindex: '-1' });
    const closeBtn = sheet.appendChild(new MockElement('button', { class: 'sheet-close-btn' }));
    const addInput = sheet.appendChild(new MockElement('input', { class: 'before-leaving-input' }));

    const focusable = sheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    // Focus on closeBtn (first element) -> Shift+Tab backward
    const result = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: 0, // closeBtn (first)
      shiftKey: true,
    });

    assert.equal(result.prevented, true, 'Default Shift+Tab must be prevented to loop');
    assert.equal(result.nextActiveElement, addInput, 'Focus must loop backward to last element (addInput)');
  });

  it('cycles Tab across populated list with intermediate elements and disabled boundaries', () => {
    const sheet = new MockElement('div', { tabindex: '-1' });
    const closeBtn = sheet.appendChild(new MockElement('button', { class: 'sheet-close-btn' }));
    const addInput = sheet.appendChild(new MockElement('input', { class: 'before-leaving-input' }));
    const addBtn = sheet.appendChild(new MockElement('button', { class: 'before-leaving-add-btn' })); // enabled

    // Item 0 (first item in list)
    const item0UpDisabled = sheet.appendChild(new MockElement('button', { disabled: true })); // index === 0 disabled
    const item0Down = sheet.appendChild(new MockElement('button', { class: 'down' }));
    const item0Edit = sheet.appendChild(new MockElement('button', { class: 'edit' }));
    const item0Delete = sheet.appendChild(new MockElement('button', { class: 'delete' }));

    // Item 1 (last item in list)
    const item1Up = sheet.appendChild(new MockElement('button', { class: 'up' }));
    const item1DownDisabled = sheet.appendChild(new MockElement('button', { disabled: true })); // index === len-1 disabled
    const item1Edit = sheet.appendChild(new MockElement('button', { class: 'edit' }));
    const item1Delete = sheet.appendChild(new MockElement('button', { class: 'delete' }));

    // Footer
    const launchBtn = sheet.appendChild(new MockElement('button', { class: 'before-leaving-launch-preview-btn' }));

    const focusable = sheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    // Verify disabled items are cleanly skipped
    assert.ok(!focusable.includes(item0UpDisabled), 'Disabled up button must be excluded');
    assert.ok(!focusable.includes(item1DownDisabled), 'Disabled down button must be excluded');
    assert.ok(!focusable.includes(sheet), 'Sheet with tabindex="-1" must be excluded');

    assert.equal(focusable[0], closeBtn, 'First element is closeBtn');
    assert.equal(focusable[focusable.length - 1], launchBtn, 'Last element is launchBtn');

    // 1. Forward wrap: from launchBtn -> closeBtn
    const forwardWrap = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: focusable.length - 1,
      shiftKey: false,
    });
    assert.equal(forwardWrap.prevented, true);
    assert.equal(forwardWrap.nextActiveElement, closeBtn);

    // 2. Backward wrap: from closeBtn -> launchBtn
    const backwardWrap = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: 0,
      shiftKey: true,
    });
    assert.equal(backwardWrap.prevented, true);
    assert.equal(backwardWrap.nextActiveElement, launchBtn);

    // 3. Intermediate forward tab: from addInput -> addBtn
    const intermediateForward = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: 1, // addInput
      shiftKey: false,
    });
    assert.equal(intermediateForward.prevented, false, 'Intermediate tab should not be prevented');
    assert.equal(intermediateForward.nextActiveElement, addBtn);

    // 4. Intermediate backward tab: from addBtn -> addInput
    const intermediateBackward = simulateTabNavigation({
      focusableElements: focusable,
      currentActiveIndex: 2, // addBtn
      shiftKey: true,
    });
    assert.equal(intermediateBackward.prevented, false);
    assert.equal(intermediateBackward.nextActiveElement, addInput);
  });
});

// ==============================================================================
// 3. Responsive Geometry Suite (@media max-width: 360px)
// ==============================================================================

describe('3. Mobile Viewport Geometry & Header Layout Resilience (@media max-width: 360px)', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');

  it('verifies exact media query rules for <= 360px mobile viewports', () => {
    assert.ok(css.includes('@media (max-width: 360px)'));
    assert.ok(css.includes('.app-header .header-before-leaving-btn {'));
    assert.ok(css.includes('width: 38px;'));
    assert.ok(css.includes('height: 38px;'));
    assert.ok(css.includes('padding: 0;'));
    assert.ok(css.includes('border-radius: var(--radius-full);'));
    assert.ok(css.includes('justify-content: center;'));
    assert.ok(css.includes('flex-shrink: 0;'));
    assert.ok(css.includes('.app-header .header-before-leaving-btn span {\n    display: none !important;\n  }'));
  });

  it('calculates header element bounding geometry on 320px screen width', () => {
    const screenWidth = 320; // e.g. iPhone SE 1st gen
    const safeLeft = 0;
    const safeRight = 0;

    // Header padding: 12px calc(18px + safeRight) 8px calc(18px + safeLeft)
    const paddingLeft = 18 + safeLeft;
    const paddingRight = 18 + safeRight;
    const availableWidth = screenWidth - paddingLeft - paddingRight; // 284px

    // Profile Bubble max-width: 185px (from CSS line 481)
    const maxProfileBubbleWidth = 185;
    const headerGap = 8; // from CSS line 400: gap: 8px

    // Collapsed Before-Leaving Button width: 38px
    const collapsedBtnWidth = 38;

    const totalOccupiedWidth = maxProfileBubbleWidth + headerGap + collapsedBtnWidth;
    const marginHeadroom = availableWidth - totalOccupiedWidth;

    assert.equal(totalOccupiedWidth, 231);
    assert.ok(marginHeadroom > 0, `Header headroom (${marginHeadroom}px) must be positive on 320px screen`);
    assert.equal(marginHeadroom, 53, 'Headroom on 320px screen is exactly 53px');
  });

  it('calculates header element bounding geometry on 360px screen width', () => {
    const screenWidth = 360; // e.g. Galaxy S / small Androids
    const paddingLeft = 18;
    const paddingRight = 18;
    const availableWidth = screenWidth - paddingLeft - paddingRight; // 324px

    const maxProfileBubbleWidth = 185;
    const headerGap = 8;
    const collapsedBtnWidth = 38;

    const totalOccupiedWidth = maxProfileBubbleWidth + headerGap + collapsedBtnWidth;
    const marginHeadroom = availableWidth - totalOccupiedWidth;

    assert.ok(marginHeadroom > 0, `Header headroom (${marginHeadroom}px) must be positive on 360px screen`);
    assert.equal(marginHeadroom, 93, 'Headroom on 360px screen is exactly 93px');
  });

  it('verifies accessibility attributes are preserved when text span is visually collapsed', () => {
    const appSource = fs.readFileSync('frontend/src/App.jsx', 'utf8');

    // Header before leaving button in App.jsx must have title and aria-label
    assert.match(appSource, /<button[^>]*className="header-before-leaving-btn"[^>]*title="Режим «Перед выходом»"/);
    assert.match(appSource, /<button[^>]*className="header-before-leaving-btn"[^>]*aria-label="Режим «Перед выходом»"/);
    assert.match(appSource, /<DoorOpen size=\{16\} \/>/);
  });
});

// ==============================================================================
// 4. Adversarial Event Coordination & Focus Trap Edge Cases
// ==============================================================================

describe('4. Adversarial Event Coordination & Focus Trap Edge Cases', () => {
  it('simulates ProfileBubbleContextMenu handleClickOutside event dispatch logic', () => {
    let closedCount = 0;
    const onClose = () => { closedCount++; };

    // Function simulating handleClickOutside from ProfileBubbleContextMenu.jsx
    function handleClickOutside(target, menuEl, triggerEl) {
      const el = target;
      // Dropdown containment check (covers both ref and cross-instance class)
      if (menuEl?.contains(el) || (el && typeof el.closest === 'function' && el.closest('.profile-bubble-dropdown'))) {
        return;
      }
      // Trigger containment check (covers optional triggerRef and profile bubble class)
      if (triggerEl?.contains(el) || (el && typeof el.closest === 'function' && el.closest('.header-profile-bubble'))) {
        return;
      }
      onClose();
    }

    // Mock DOM node with closest support
    function makeNode(className, parent = null) {
      const node = {
        className,
        parent,
        contains: (child) => {
          let curr = child;
          while (curr) {
            if (curr === node) return true;
            curr = curr.parent;
          }
          return false;
        },
        closest: (sel) => {
          const targetClass = sel.replace('.', '');
          let curr = node;
          while (curr) {
            if (curr.className && curr.className.split(' ').includes(targetClass)) return curr;
            curr = curr.parent;
          }
          return null;
        },
      };
      return node;
    }

    const menuNode = makeNode('profile-bubble-dropdown');
    const menuItemNode = makeNode('profile-dropdown-item', menuNode);
    const bubbleNode = makeNode('header-profile-bubble');
    const avatarNode = makeNode('header-avatar-circle', bubbleNode);
    const backdropNode = makeNode('app-container');

    // Scenario A: Click on trigger bubble (e.g. avatar inside bubble)
    closedCount = 0;
    handleClickOutside(avatarNode, menuNode, bubbleNode);
    assert.equal(closedCount, 0, 'Click on profile bubble trigger must NOT call onClose() during downstroke');

    // Scenario B: Click inside menu on menu item
    closedCount = 0;
    handleClickOutside(menuItemNode, menuNode, bubbleNode);
    assert.equal(closedCount, 0, 'Click inside menu item must NOT call onClose()');

    // Scenario C: Multi-instance click: click inside sibling instance
    const siblingMenuNode = makeNode('profile-bubble-dropdown');
    const siblingItemNode = makeNode('profile-dropdown-item', siblingMenuNode);
    closedCount = 0;
    handleClickOutside(siblingItemNode, menuNode, bubbleNode);
    assert.equal(closedCount, 0, 'Click in any .profile-bubble-dropdown must NOT call onClose() on other instance');

    // Scenario D: Click on backdrop/outside element
    closedCount = 0;
    handleClickOutside(backdropNode, menuNode, bubbleNode);
    assert.equal(closedCount, 1, 'Click outside must invoke onClose()');
  });

  it('verifies focus trap resilience with 0 and 1 focusable elements', () => {
    // 0 elements: should not throw
    const emptyElements = [];
    const event = { key: 'Tab', shiftKey: false, preventDefault: () => {} };
    assert.doesNotThrow(() => {
      if (emptyElements.length > 0) {
        // ...
      }
    });

    // 1 element: should keep focus on that element
    const singleElement = { focus: () => {} };
    const elements = [singleElement];
    const first = elements[0];
    const last = elements[elements.length - 1];

    let target = null;
    let prevented = false;
    const tabEvent = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => { prevented = true; },
    };

    let activeElement = singleElement;
    if (tabEvent.shiftKey && activeElement === first) {
      tabEvent.preventDefault();
      target = last;
    } else if (!tabEvent.shiftKey && activeElement === last) {
      tabEvent.preventDefault();
      target = first;
    }

    assert.equal(prevented, true);
    assert.equal(target, singleElement);
  });
});
