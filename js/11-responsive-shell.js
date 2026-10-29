
(function(){
  function initials(value=''){
    const parts=String(value||'User').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0,2).map(x=>x.charAt(0)).join('')||'U').toUpperCase();
  }

  window.closeProfileMenu=function(){
    const menu=document.getElementById('userProfileMenu');
    const btn=document.getElementById('userProfileBtn');
    if(menu){menu.classList.remove('show');menu.setAttribute('aria-hidden','true')}
    if(btn)btn.setAttribute('aria-expanded','false');
  };

  window.toggleProfileMenu=function(ev){
    if(ev)ev.stopPropagation();
    const menu=document.getElementById('userProfileMenu');
    const btn=document.getElementById('userProfileBtn');
    if(!menu||!btn)return;
    const open=!menu.classList.contains('show');
    closeMobileNav();
    menu.classList.toggle('show',open);
    menu.setAttribute('aria-hidden',String(!open));
    btn.setAttribute('aria-expanded',String(open));
  };

  window.closeMobileNav=function(){
    document.body.classList.remove('mobile-nav-open');
    const btn=document.getElementById('mobileNavToggle');
    if(btn)btn.setAttribute('aria-expanded','false');
  };

  window.toggleMobileNav=function(){
    closeProfileMenu();
    const open=!document.body.classList.contains('mobile-nav-open');
    document.body.classList.toggle('mobile-nav-open',open);
    const btn=document.getElementById('mobileNavToggle');
    if(btn)btn.setAttribute('aria-expanded',String(open));
  };

  window.refreshShellProfile=function(){
    const u=(typeof currentUser!=='undefined'&&currentUser)?currentUser:null;
    const display=u?.display||u?.username||'Not signed in';
    const username=u?.username||'—';
    const role=String(u?.role||'User');
    const avatar=initials(display);
    const chip=document.getElementById('currentUserChip');
    const roleEl=document.getElementById('currentUserRole');
    const displayEl=document.getElementById('profileDisplayName');
    const usernameEl=document.getElementById('profileUsername');
    const roleLabel=document.getElementById('profileRoleLabel');
    const av=document.getElementById('userAvatar');
    const av2=document.getElementById('userAvatarMenu');
    if(chip)chip.textContent=display;
    if(roleEl)roleEl.textContent=role.charAt(0).toUpperCase()+role.slice(1);
    if(displayEl)displayEl.textContent=display;
    if(usernameEl)usernameEl.textContent=username?`@${username}`:'—';
    if(roleLabel)roleLabel.textContent=role.charAt(0).toUpperCase()+role.slice(1);
    if(av)av.textContent=avatar;
    if(av2)av2.textContent=avatar;

    const adminBtn=document.getElementById('profileAdminBtn');
    const settingsBtn=document.getElementById('profileSettingsBtn');
    try{
      if(adminBtn)adminBtn.style.display=(typeof hasPerm==='function'&&hasPerm('admin_profit'))?'flex':'none';
      if(settingsBtn)settingsBtn.style.display=(typeof hasPerm==='function'&&hasPerm('settings'))?'flex':'none';
    }catch(e){
      if(adminBtn)adminBtn.style.display=role==='admin'?'flex':'none';
      if(settingsBtn)settingsBtn.style.display=role==='admin'?'flex':'none';
    }
  };

  // Wrap the final runtime functions only after every feature module has loaded.
  if(typeof window.showView==='function'){
    const baseShowView=window.showView;
    window.showView=function(){
      const result=baseShowView.apply(this,arguments);
      closeMobileNav();
      closeProfileMenu();
      return result;
    };
  }

  if(typeof window.loginUser==='function'){
    const baseLogin=window.loginUser;
    window.loginUser=function(){
      const result=baseLogin.apply(this,arguments);
      setTimeout(refreshShellProfile,0);
      return result;
    };
  }

  if(typeof window.restoreSession==='function'){
    const baseRestore=window.restoreSession;
    window.restoreSession=function(){
      const result=baseRestore.apply(this,arguments);
      setTimeout(refreshShellProfile,0);
      return result;
    };
  }

  if(typeof window.logoutUser==='function'){
    const baseLogout=window.logoutUser;
    window.logoutUser=function(){
      closeProfileMenu();
      closeMobileNav();
      const result=baseLogout.apply(this,arguments);
      setTimeout(refreshShellProfile,0);
      return result;
    };
  }

  document.addEventListener('click',function(e){
    const wrap=e.target.closest?.('.user-profile-wrap');
    if(!wrap)closeProfileMenu();
  });

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      closeProfileMenu();
      closeMobileNav();
    }
  });

  window.addEventListener('resize',function(){
    // Navigation is intentionally a drawer at every viewport size.
    // Only close the floating profile menu when the viewport changes.
    closeProfileMenu();
  });

  // Dynamic feature modules add nav buttons after initial markup. Make them mobile-friendly automatically.
  const nav=document.querySelector('.nav');
  if(nav){
    nav.addEventListener('click',function(e){
      if(e.target.closest('.navbtn'))closeMobileNav();
    });
  }

  refreshShellProfile();
})();
