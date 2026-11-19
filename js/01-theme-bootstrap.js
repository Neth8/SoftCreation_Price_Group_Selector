
(function(){
  // Permanent default Supabase anon key for qyxgamverzdmhtvezbft
  window.SPGS_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5eGdhbXZlcnpkbWh0dmV6YmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjUwMDgsImV4cCI6MjA4MzQ0MTAwOH0.HQhMiD8DwMHMoHj0JtVIXCXhJArfiNnwMfz3a8Z5jyk';
  const BROWSER_KEY_STORE = 'spgs_supabase_browser_key_v1';
  try {
    const existing = (localStorage.getItem(BROWSER_KEY_STORE) || '').trim();
    if (!existing || existing.indexOf('eyJ') === -1) {
      localStorage.setItem(BROWSER_KEY_STORE, window.SPGS_SUPABASE_ANON_KEY);
    }
  } catch(e) {}

  const KEY = 'softcreation_theme_v1';

  try{

    const saved =
      localStorage.getItem(KEY);

    const theme =
      saved === 'dark'
        ? 'dark'
        : 'light';

    document.documentElement
      .setAttribute(
        'data-theme',
        theme
      );

    document.documentElement.style.colorScheme =
      theme;

  }catch(e){}

  // Global prevention of mouse wheel altering input values or dropdowns across the whole system
  (function initGlobalWheelProtection() {
    function isModifiableOnWheel(el) {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      if (tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (el.type || '').toLowerCase();
        if (type === 'number' || type === 'range' || type === 'date' || type === 'time' || type === 'datetime-local') return true;
        if (el.classList && (el.classList.contains('num') || el.classList.contains('tinyin'))) return true;
      }
      return false;
    }

    // Capture phase on window: blur active number input / select before browser can step the value
    window.addEventListener('wheel', function(e) {
      const active = document.activeElement;
      if (isModifiableOnWheel(active)) {
        active.blur();
      }
      if (isModifiableOnWheel(e.target) && document.activeElement === e.target) {
        e.target.blur();
      }
    }, { capture: true, passive: true });

    // Also bind directly on focusin for immediate per-element protection
    document.addEventListener('focusin', function(e) {
      const t = e.target;
      if (isModifiableOnWheel(t) && !t.__scWheelLockActive) {
        t.__scWheelLockActive = true;
        t.addEventListener('wheel', function() {
          if (document.activeElement === t) {
            t.blur();
          }
        }, { passive: true });
      }
    }, true);
  })();

})();
