
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

})();
