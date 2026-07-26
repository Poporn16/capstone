import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css';
import App from './App.tsx'

// =========================================================================
// ANTI-INSPECT PROTECTION TOGGLE
// Set to `true` to disable Inspect Element, Right-Click, Console, and DevTools shortcuts.
// Set to `false` during development if you need to use Inspect / DevTools.
// =========================================================================
const ENABLE_ANTI_INSPECT = false;

if (typeof window !== 'undefined' && ENABLE_ANTI_INSPECT) {
  // Prevent context menu (Right-click)
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Prevent selection/dragging of text & elements to prevent copying
  document.addEventListener('selectstart', (e) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  // Mute browser console logs & clear console continuously
  const noop = () => {};
  window.console.log = noop;
  window.console.warn = noop;
  window.console.error = noop;
  window.console.info = noop;
  window.console.debug = noop;
  window.console.table = noop;
  window.console.dir = noop;

  setInterval(() => {
    console.clear();
  }, 500);

  // Prevent keyboard shortcuts for DevTools & View Source
  document.addEventListener('keydown', (e) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isAlt = e.altKey;
    const key = e.key.toLowerCase();
    const code = e.code;

    // F12 key
    if (e.key === 'F12' || code === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // DevTools shortcuts:
    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    // Ctrl+Shift+J / Cmd+Option+J (Console)
    // Ctrl+Shift+C / Cmd+Option+C (Element Picker)
    // Ctrl+Shift+K / Cmd+Option+K (Firefox DevTools)
    if (
      (isCmdOrCtrl && isShift && ['i', 'j', 'c', 'k'].includes(key)) ||
      (isCmdOrCtrl && isAlt && ['i', 'j', 'c', 'k'].includes(key))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // View Source / Save Page shortcuts (Ctrl+U / Cmd+U, Ctrl+S / Cmd+S)
    if (isCmdOrCtrl && ['u', 's'].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  // Aggressive Anti-Debugging Trap: freezes DevTools if opened
  setInterval(() => {
    const startTime = performance.now();
    (function () {
      return false;
    })
      ['constructor']('debugger')();
    const endTime = performance.now();

    // If execution was paused by DevTools debugger for > 100ms
    if (endTime - startTime > 100) {
      const rootEl = document.getElementById('root');
      if (rootEl) {
        rootEl.style.display = 'none';
      }
    }
  }, 200);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
