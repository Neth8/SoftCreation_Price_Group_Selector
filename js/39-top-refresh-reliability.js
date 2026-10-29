
/* =========================================================
   V1.0.79
   TOP REFRESH + USER EDIT RELIABILITY
   ---------------------------------------------------------
   1) Top-right Refresh button reloads the running app with a
      cache-busting query value so APK/WebView users can force
      a fresh bootstrap/cloud pull.
   2) Existing-user edit no longer falls back into "new user"
      validation after secure-password authorization.
   3) Existing username is preserved and password is optional
      during edit.
   ========================================================= */
(function(){
  'use strict';

  /* -------------------------------------------------------
     REFRESH
     ------------------------------------------------------- */
  window.refreshApplicationV1079=function(){
    const btn=document.getElementById(
      'appRefreshBtnV1079'
    );

    if(btn){
      btn.disabled=true;
      btn.classList.add('is-refreshing');
      btn.setAttribute(
        'aria-busy',
        'true'
      );
    }

    try{
      /*
        A full bootstrap is intentional here.
        The app already reloads its cloud state/users during startup.
        The timestamp also prevents stale APK/WebView page caching.
      */
      const url=new URL(
        window.location.href
      );

      url.searchParams.set(
        'sc_refresh',
        String(Date.now())
      );

      window.location.replace(
        url.toString()
      );

    }catch(err){
      console.warn(
        'Cache-busting refresh failed; using normal reload',
        err
      );

      window.location.reload();
    }
  };

  /* -------------------------------------------------------
     USER EDIT UI CLARITY
     ------------------------------------------------------- */
  function updateUserEditorLabelsV1079(user){
    const usernameInput=
      document.getElementById('newUsername');

    const passwordInput=
      document.getElementById('newUserPassword');

    const usernameLabel=
      usernameInput?.closest('.field')
        ?.querySelector('label');

    const passwordLabel=
      passwordInput?.closest('.field')
        ?.querySelector('label');

    const editing=!!user?.id;

    if(usernameLabel){
      usernameLabel.textContent=
        editing
          ? 'Username'
          : 'New Username';
    }

    if(passwordLabel){
      passwordLabel.textContent=
        editing
          ? 'New Password (Optional)'
          : 'New Password';
    }

    if(passwordInput){
      passwordInput.value='';
      passwordInput.placeholder=
        editing
          ? 'Leave blank to keep current password'
          : '';
    }

    if(usernameInput){
      usernameInput.disabled=editing;
    }
  }

  if(typeof renderUserPrivilegeEditor==='function'){
    const baseRenderUserV1079=
      renderUserPrivilegeEditor;

    window.renderUserPrivilegeEditor=function(user=null){
      const r=
        baseRenderUserV1079.apply(
          this,
          arguments
        );

      /*
        Re-assert the exact existing ID after all older wrappers
        finish rendering. This prevents edit mode being mistaken
        for a new-user form.
      */
      const editId=
        document.getElementById('editUserId');

      if(editId){
        editId.value=
          user?.id||'';
      }

      updateUserEditorLabelsV1079(
        user
      );

      const saveBtn=
        document.getElementById('userSaveBtn');

      if(saveBtn){
        saveBtn.textContent=
          user
            ? 'Update User'
            : 'Add User';

        saveBtn.setAttribute(
          'onclick',
          'saveSystemUserV6()'
        );
      }

      const cancelBtn=
        document.getElementById('cancelUserEdit');

      if(cancelBtn){
        cancelBtn.style.display=
          user
            ? 'inline-block'
            : 'none';
      }

      return r;
    };

    try{
      renderUserPrivilegeEditor=
        window.renderUserPrivilegeEditor;
    }catch(_){}
  }

  /* -------------------------------------------------------
     RELIABLE USER SAVE
     -------------------------------------------------------
     Important:
     Older V8.5/V8.6 wrappers continued running after
     protectedEdit() opened the system password modal. They
     could reset renderUserPrivilegeEditor(null), clearing
     editUserId before the modal retried the button. The retry
     then looked like a NEW USER and raised:
       "Username and password are required for a new user"

     This final save function performs the password gate first
     and returns with ZERO form mutation until authorization
     succeeds.
     ------------------------------------------------------- */
  window.saveSystemUserV6=function(){
    if(
      typeof requirePerm==='function' &&
      !requirePerm(
        'manage_users',
        'manage users'
      )
    ){
      return;
    }

    /*
      protectedEdit() is routed through the existing in-app
      secure password modal. On first click it returns false;
      after approval it retries the same button with one-use
      authorization. Nothing below executes on the first pass.
    */
    if(
      typeof protectedEdit==='function' &&
      !protectedEdit(
        'save user access privileges'
      )
    ){
      return;
    }

    const editIdEl=
      document.getElementById('editUserId');

    const id=String(
      editIdEl?.value||''
    ).trim();

    let existing=id
      ? (state.users||[]).find(
          x=>String(x.id)===id
        )
      : null;

    /*
      Safety fallback for legacy form states:
      if editId was unexpectedly lost but the username field is
      disabled, this is still clearly an existing-user edit.
    */
    const usernameEl=
      document.getElementById('newUsername');

    const username=String(
      usernameEl?.value||''
    ).trim();

    if(
      !existing &&
      username &&
      usernameEl?.disabled
    ){
      existing=(state.users||[]).find(
        x=>String(x.username)===username
      )||null;
    }

    const password=String(
      document.getElementById(
        'newUserPassword'
      )?.value||''
    );

    const display=String(
      document.getElementById(
        'newUserDisplay'
      )?.value||''
    ).trim()||username;

    const role=String(
      document.getElementById(
        'newUserRole'
      )?.value||'sales'
    );

    if(!username){
      toast('Username is required');
      return;
    }

    if(!existing && !password){
      toast(
        'Username and password are required for a new user'
      );
      return;
    }

    if(
      !existing &&
      (state.users||[]).some(
        x=>String(x.username)===username
      )
    ){
      toast('Username already exists');
      return;
    }

    const permissions=
      role==='admin'
        ? USER_FEATURES.map(x=>x[0])
        : checkedValues('userPerm');

    const priceCategoryIds=
      role==='admin'
        ? (state.priceCategories||[])
            .map(c=>c.id)
        : checkedValues(
            'userPriceCat'
          );

    const quoteHandler=String(
      document.getElementById(
        'userQuoteHandler'
      )?.value||'admin'
    );

    const companyLinkType=String(
      document.getElementById(
        'userCompanyLinkType'
      )?.value||''
    );

    const companyLinkId=String(
      document.getElementById(
        'userCompanyLinkId'
      )?.value||''
    );

    const needsPortal=
      permissions.includes(
        'branch_portal'
      );

    if(
      role!=='admin' &&
      needsPortal &&
      !companyLinkId
    ){
      toast(
        'Link a Customer/Company or Introducer before saving this Branch Portal user'
      );
      return;
    }

    let user=existing;

    if(user){
      /*
        Existing user:
        - username remains unchanged
        - blank password keeps old password
      */
      Object.assign(
        user,
        {
          display,
          role,
          permissions,
          priceCategoryIds,
          quoteHandler,
          companyLinkType:
            companyLinkId
              ? companyLinkType
              : '',
          companyLinkId
        }
      );

      if(password){
        user.password=password;
      }

      audit(
        'UPDATE_USER_PRIVILEGES',
        `${user.username}: ${permissions.join(',')}`
      );

    }else{
      user={
        id:uid('user'),
        username,
        password,
        display,
        role,
        active:true,
        permissions,
        priceCategoryIds,
        quoteHandler,
        companyLinkType:
          companyLinkId
            ? companyLinkType
            : '',
        companyLinkId
      };

      state.users.push(user);

      audit(
        'ADD_USER',
        `${username}: ${permissions.join(',')}`
      );
    }

    saveState();

    try{
      renderUsers();
    }catch(_){}

    try{
      renderUserPrivilegeEditor(null);
    }catch(_){}

    toast(
      existing
        ? 'User updated successfully'
        : 'User added successfully'
    );
  };

  try{
    saveSystemUserV6=
      window.saveSystemUserV6;
  }catch(_){}

  /*
    If Settings/User Management is already open when this patch
    loads, normalize the current editor state without clearing an
    active edit.
  */
  const currentEditId=String(
    document.getElementById(
      'editUserId'
    )?.value||''
  ).trim();

  if(currentEditId){
    const u=(state.users||[]).find(
      x=>String(x.id)===currentEditId
    );

    if(u){
      updateUserEditorLabelsV1079(u);
    }
  }

})();
