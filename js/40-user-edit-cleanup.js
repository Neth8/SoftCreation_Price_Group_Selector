
/* =========================================================
   V1.0.80
   USER EDIT SAVE FIX + PRO FORMA CLEANUP
   ---------------------------------------------------------
   1) Existing-user edit is tracked with a dedicated stable ID
      on the Update User button, not only editUserId.
   2) Existing-user password remains optional.
   3) Bypasses the older V8.5/V8.6 save-wrapper chain that could
      accidentally treat an edit as a new user after password auth.
   4) Pro Forma Stores print action buttons are hidden separately
      by CSS; status/order information remains visible.
   ========================================================= */
(function(){
  'use strict';

  window.__scEditingUserIdV1080 =
    window.__scEditingUserIdV1080 || '';

  function setUserEditStateV1080(user){
    const id=String(user?.id||'');

    window.__scEditingUserIdV1080=id;

    const hidden=document.getElementById('editUserId');
    if(hidden)hidden.value=id;

    const btn=document.getElementById('userSaveBtn');
    if(btn){
      if(id){
        btn.dataset.editUserId=id;
        btn.textContent='Update User';
      }else{
        delete btn.dataset.editUserId;
        btn.textContent='Add User';
      }

      /*
        Use a unique final handler so the legacy saveSystemUserV6
        wrapper chain cannot run by mistake.
      */
      btn.setAttribute(
        'onclick',
        'saveSystemUserV1080()'
      );
    }

    const cancel=document.getElementById('cancelUserEdit');
    if(cancel){
      cancel.style.display=id?'inline-block':'none';
    }

    const username=document.getElementById('newUsername');
    const password=document.getElementById('newUserPassword');

    if(username){
      username.disabled=!!id;
    }

    if(password){
      password.value='';
      password.placeholder=
        id
          ? 'Leave blank to keep current password'
          : '';
    }

    const usernameLabel=
      username?.closest('.field')
        ?.querySelector('label');

    const passwordLabel=
      password?.closest('.field')
        ?.querySelector('label');

    if(usernameLabel){
      usernameLabel.textContent=
        id
          ? 'Username'
          : 'New Username';
    }

    if(passwordLabel){
      passwordLabel.textContent=
        id
          ? 'New Password (Optional)'
          : 'New Password';
    }
  }

  /*
    Wrap the final user editor renderer only to establish a stable
    edit identity after every legacy renderer/wrapper has completed.
  */
  if(typeof renderUserPrivilegeEditor==='function'){
    const baseRenderV1080=
      renderUserPrivilegeEditor;

    window.renderUserPrivilegeEditor=function(user=null){
      const result=
        baseRenderV1080.apply(
          this,
          arguments
        );

      setUserEditStateV1080(user);

      return result;
    };

    try{
      renderUserPrivilegeEditor=
        window.renderUserPrivilegeEditor;
    }catch(_){}
  }

  if(typeof editSystemUser==='function'){
    const baseEditV1080=
      editSystemUser;

    window.editSystemUser=function(id){
      const user=(state.users||[]).find(
        x=>String(x.id)===String(id)
      );

      if(user){
        /*
          Establish this before calling older layers as well.
        */
        window.__scEditingUserIdV1080=
          String(user.id);
      }

      const result=
        baseEditV1080.apply(
          this,
          arguments
        );

      if(user){
        setUserEditStateV1080(user);
      }

      return result;
    };

    try{
      editSystemUser=
        window.editSystemUser;
    }catch(_){}
  }

  window.cancelUserEditV1080=function(){
    window.__scEditingUserIdV1080='';

    if(typeof renderUserPrivilegeEditor==='function'){
      renderUserPrivilegeEditor(null);
    }
  };

  const cancelBtn=
    document.getElementById('cancelUserEdit');

  if(cancelBtn){
    cancelBtn.setAttribute(
      'onclick',
      'cancelUserEditV1080()'
    );
  }

  let spgsUserSaveBusyV1132=false;
  window.saveSystemUserV1080=async function(){
    if(spgsUserSaveBusyV1132)return;
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
      Keep the existing in-system secure password dialog.
      First pass opens it and returns. Its retry clicks this same
      button, whose data-edit-user-id remains intact.
    */
    if(
      typeof protectedEdit==='function' &&
      !protectedEdit(
        'save user access privileges'
      )
    ){
      return;
    }

    const saveBtn=
      document.getElementById('userSaveBtn');

    const hiddenId=String(
      document.getElementById('editUserId')?.value||''
    ).trim();

    const stableId=String(
      saveBtn?.dataset?.editUserId ||
      window.__scEditingUserIdV1080 ||
      hiddenId ||
      ''
    ).trim();

    const usernameEl=
      document.getElementById('newUsername');

    const username=String(
      usernameEl?.value||''
    ).trim();

    const password=String(
      document.getElementById('newUserPassword')?.value||''
    );

    const display=String(
      document.getElementById('newUserDisplay')?.value||''
    ).trim()||username;

    const role=String(
      document.getElementById('newUserRole')?.value||'sales'
    );

    let existing=stableId
      ? (state.users||[]).find(
          x=>String(x.id)===stableId
        )
      : null;

    /*
      Extra edit-mode safety:
      disabled username + matching account is an existing user.
    */
    if(
      !existing &&
      username &&
      usernameEl?.disabled
    ){
      existing=(state.users||[]).find(
        x=>String(x.username)===username
      )||null;
    }

    if(!username){
      toast('Username is required');
      return;
    }

    /*
      Password is required ONLY for a true new account.
    */
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
        ? (state.priceCategories||[]).map(c=>c.id)
        : checkedValues('userPriceCat');

    const quoteHandler=String(
      document.getElementById('userQuoteHandler')?.value||'admin'
    );

    const companyLinkType=String(
      document.getElementById('userCompanyLinkType')?.value||''
    );

    const companyLinkId=String(
      document.getElementById('userCompanyLinkId')?.value||''
    );

    if(
      role!=='admin' &&
      permissions.includes('branch_portal') &&
      !companyLinkId
    ){
      toast(
        'Link a Customer/Company or Introducer before saving this Branch Portal user'
      );
      return;
    }

    const candidate=existing
      ? {
          ...existing,
          display,role,permissions,priceCategoryIds,
          quoteHandler,companyLinkType:companyLinkId?companyLinkType:'',companyLinkId,
          ...(password?{password}:{})
        }
      : {
          id:uid('user'),username,password,display,role,active:true,
          permissions,priceCategoryIds,quoteHandler,
          companyLinkType:companyLinkId?companyLinkType:'',companyLinkId
        };

    // Never clear the editor, mutate the live user list, or show success until
    // Supabase has confirmed the write AND a read-back of the permissions.
    if(typeof window.spgsSaveUserVerifiedV1132!=='function'){
      toast('Cloud user save is unavailable. Reload SPGS and try again.');
      return;
    }
    spgsUserSaveBusyV1132=true;
    if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving to cloud...';}
    try{
      const confirmed=await window.spgsSaveUserVerifiedV1132(candidate,!!existing);
      if(existing){
        Object.assign(existing,confirmed);
      }else{
        state.users.push(confirmed);
      }
      audit(existing?'UPDATE_USER_PRIVILEGES':'ADD_USER',
        `${confirmed.username}: ${(confirmed.permissions||[]).join(',')}`);
      saveState();
      try{renderUsers();}catch(e){console.warn('User list refresh',e)}
      window.__scEditingUserIdV1080='';
      try{renderUserPrivilegeEditor(null);}catch(e){console.warn('User editor refresh',e)}
      toast(existing?'User permissions saved and verified in Supabase':'User created and verified in Supabase');
    }catch(e){
      console.error('SPGS user permissions cloud update failed',e);
      toast('User NOT updated: '+String(e?.message||e).slice(0,180));
      // Keep all edited fields and checkboxes so the admin can retry.
    }finally{
      spgsUserSaveBusyV1132=false;
      if(saveBtn){saveBtn.disabled=false;
        saveBtn.textContent=window.__scEditingUserIdV1080?'Update User':'Add User';}
    }

  };

  /*
    Rebind now, because User Management may already be rendered.
  */
  const saveBtn=
    document.getElementById('userSaveBtn');

  if(saveBtn){
    saveBtn.setAttribute(
      'onclick',
      'saveSystemUserV1080()'
    );
  }

  if(cancelBtn){
    cancelBtn.setAttribute(
      'onclick',
      'cancelUserEditV1080()'
    );
  }

})();
