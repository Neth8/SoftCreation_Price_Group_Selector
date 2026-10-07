
(function(){

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
