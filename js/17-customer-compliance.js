
/* =========================================================
   v1.0.24 — CUSTOMER COMPLIANCE, ASSIGNMENT & PASSWORD UX
   ---------------------------------------------------------
   1. Removes calculator's duplicate Previous Prices message.
   2. VAT + BR certificates save to Supabase Storage.
   3. BR is required unless an Admin authorizes "No BR".
   4. Customer can be assigned to an active system user/freelancer.
      The assignment uses ownerUser so existing visibility rules work.
   5. Password input fields get Show/Hide eye controls.
   6. Password confirmations use a secure password modal instead of
      plaintext native prompt boxes wherever the system password gates
      are routed through the global helpers.
   ========================================================= */
(function(){
  'use strict';

  const CUSTOMER_DOC_BUCKET_V1024='customer-documents';
  const CUSTOMER_DOC_PROJECT_URL_V1024='https://qyxgamverzdmhtvezbft.supabase.co';
  const CUSTOMER_DOC_MAX_BYTES_V1024=10*1024*1024;

  window.__scPasswordBypassV1024=window.__scPasswordBypassV1024||{
    current:0,
    manager:0,
    admin:0
  };

  let securePasswordPendingV1024=null;
  let secureViewBypassV1024='';

  /* -------------------------------------------------------
     Remove duplicate Previous Prices block from calculator.
     History remains under Customer Item Master.
     ------------------------------------------------------- */
  window.showCustomerPriceSuggestion=function(){
    const box=$('customerPriceSuggestion');
    if(box)box.innerHTML='';
  };
  try{showCustomerPriceSuggestion=window.showCustomerPriceSuggestion}catch(_){}

  /* -------------------------------------------------------
     Password eye helper — applies to login, user management,
     ERP/API password fields and future password inputs.
     ------------------------------------------------------- */
  function enhancePasswordInputV1024(input){
    if(!input||input.dataset.eyeReadyV1024==='1')return;
    input.dataset.eyeReadyV1024='1';

    const wrap=document.createElement('div');
    wrap.className='password-eye-wrap-v1024';

    input.parentNode.insertBefore(wrap,input);
    wrap.appendChild(input);

    const btn=document.createElement('button');
    btn.type='button';
    btn.className='password-eye-btn-v1024';
    btn.setAttribute('aria-label','Show password');
    btn.title='Show password';
    btn.textContent='👁';

    btn.addEventListener('click',()=>{
      const showing=input.type==='text';
      input.type=showing?'password':'text';
      btn.textContent=showing?'👁':'🙈';
      btn.setAttribute('aria-label',showing?'Show password':'Hide password');
      btn.title=showing?'Show password':'Hide password';
      input.focus();
    });

    wrap.appendChild(btn);
  }

  function enhanceAllPasswordInputsV1024(root=document){
    root.querySelectorAll?.('input[type="password"]').forEach(enhancePasswordInputV1024);
  }

  const pwObserverV1024=new MutationObserver(mutations=>{
    mutations.forEach(m=>m.addedNodes.forEach(node=>{
      if(node.nodeType!==1)return;
      if(node.matches?.('input[type="password"]'))enhancePasswordInputV1024(node);
      enhanceAllPasswordInputsV1024(node);
    }));
  });

  enhanceAllPasswordInputsV1024(document);
  pwObserverV1024.observe(document.body,{childList:true,subtree:true});

  /* -------------------------------------------------------
     Secure password modal.
     ------------------------------------------------------- */
  function ensureSecurePasswordModalV1024(){
    if($('securePasswordModalV1024'))return;

    document.body.insertAdjacentHTML('beforeend',`
      <div id="securePasswordModalV1024" class="modal">
        <div class="modal-card secure-password-card-v1024">
          <div class="modal-head">
            <div>
              <b id="securePasswordTitleV1024">Password Required</b>
              <div id="securePasswordSubtitleV1024" class="small"></div>
            </div>
            <button class="closex" type="button" onclick="cancelSecurePasswordV1024()">×</button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label>Password</label>
              <input id="securePasswordInputV1024" type="password" autocomplete="current-password" placeholder="Enter password">
            </div>
            <div id="securePasswordErrorV1024" class="secure-password-error-v1024"></div>
            <div class="actions">
              <button class="btn primary" type="button" onclick="submitSecurePasswordV1024()">Continue</button>
              <button class="btn ghost" type="button" onclick="cancelSecurePasswordV1024()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);

    enhancePasswordInputV1024($('securePasswordInputV1024'));

    $('securePasswordInputV1024').addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        submitSecurePasswordV1024();
      }
    });
  }

  function retryTargetV1024(target){
    if(typeof target==='function'){
      setTimeout(target,0);
      return;
    }
    if(target&&typeof target.click==='function'){
      setTimeout(()=>target.click(),0);
    }
  }

  function passwordMatchV1024(kind,password){
    const active=(state.users||[]).filter(u=>u&&u.active!==false);

    if(kind==='current'){
      const u=active.find(x=>x.id===currentUser?.id||x.username===currentUser?.username);
      return u&&String(u.password??'')===String(password??'')?u:null;
    }

    if(kind==='manager'){
      return active.find(x=>
        ['manager','admin'].includes(x.role) &&
        String(x.password??'')===String(password??'')
      )||null;
    }

    if(kind==='admin'){
      return active.find(x=>
        x.role==='admin' &&
        String(x.password??'')===String(password??'')
      )||null;
    }

    return null;
  }

  window.securePasswordGateV1024=function({
    kind='current',
    action='continue',
    retryTarget=null
  }={}){
    ensureSecurePasswordModalV1024();

    securePasswordPendingV1024={kind,action,retryTarget};

    const title=
      kind==='admin'
        ? 'Administrator Password Required'
        : kind==='manager'
          ? 'Manager / Administrator Approval'
          : 'Password Required';

    $('securePasswordTitleV1024').textContent=title;
    $('securePasswordSubtitleV1024').textContent=action;
    $('securePasswordErrorV1024').textContent='';
    $('securePasswordInputV1024').value='';
    $('securePasswordInputV1024').type='password';

    const btn=$('securePasswordInputV1024').parentElement?.querySelector('.password-eye-btn-v1024');
    if(btn){
      btn.textContent='👁';
      btn.title='Show password';
      btn.setAttribute('aria-label','Show password');
    }

    $('securePasswordModalV1024').classList.add('show');

    setTimeout(()=>$('securePasswordInputV1024')?.focus(),50);
    return false;
  };

  window.cancelSecurePasswordV1024=function(){
    securePasswordPendingV1024=null;
    $('securePasswordInputV1024').value='';
    $('securePasswordErrorV1024').textContent='';
    $('securePasswordModalV1024').classList.remove('show');
  };

  window.submitSecurePasswordV1024=function(){
    if(!securePasswordPendingV1024)return;

    const pending=securePasswordPendingV1024;
    const password=$('securePasswordInputV1024').value;
    const matched=passwordMatchV1024(pending.kind,password);

    if(!matched){
      $('securePasswordErrorV1024').textContent='Incorrect password.';
      return;
    }

    window.__scPasswordBypassV1024[pending.kind]=(window.__scPasswordBypassV1024[pending.kind]||0)+1;

    audit(
      pending.kind==='admin'?'ADMIN_PASSWORD_APPROVED':
      pending.kind==='manager'?'MANAGER_PASSWORD_APPROVED':
      'USER_PASSWORD_APPROVED',
      pending.action
    );
    saveState();

    securePasswordPendingV1024=null;
    $('securePasswordInputV1024').value='';
    $('securePasswordModalV1024').classList.remove('show');

    retryTargetV1024(pending.retryTarget);
  };

  function consumePasswordBypassV1024(kind){
    if((window.__scPasswordBypassV1024[kind]||0)>0){
      window.__scPasswordBypassV1024[kind]--;
      return true;
    }
    return false;
  }

  function currentRetryTargetV1024(){
    const ev=window.event;
    return ev?.currentTarget||document.activeElement||null;
  }

  /*
    Replace plaintext native password prompts used by the main security
    helpers. Existing call sites continue to work: the first call opens
    the secure modal and returns false; after successful authorization the
    original control is clicked once more with a one-use bypass token.
  */
  window.loggedUserPasswordOKV83=function(action='continue'){
    if(consumePasswordBypassV1024('current'))return true;
    securePasswordGateV1024({
      kind:'current',
      action,
      retryTarget:currentRetryTargetV1024()
    });
    return false;
  };
  try{loggedUserPasswordOKV83=window.loggedUserPasswordOKV83}catch(_){}

  window.protectedEdit=function(reason='edit this record'){
    return loggedUserPasswordOKV83(reason);
  };
  try{protectedEdit=window.protectedEdit}catch(_){}

  window.documentPasswordOK=function(action='continue'){
    return loggedUserPasswordOKV83(action);
  };
  try{documentPasswordOK=window.documentPasswordOK}catch(_){}

  window.managerOK=function(reason='approve this action'){
    if(currentUser&&['manager','admin'].includes(currentUser.role))return true;
    if(consumePasswordBypassV1024('manager'))return true;

    securePasswordGateV1024({
      kind:'manager',
      action:`Approve: ${reason}`,
      retryTarget:currentRetryTargetV1024()
    });
    return false;
  };
  try{managerOK=window.managerOK}catch(_){}

  window.priceApprovalOK=function(reason='approve this price'){
    if(consumePasswordBypassV1024('manager'))return true;

    securePasswordGateV1024({
      kind:'manager',
      action:reason,
      retryTarget:currentRetryTargetV1024()
    });
    return false;
  };
  try{priceApprovalOK=window.priceApprovalOK}catch(_){}

  window.adminPasswordOKV84=function(action='continue'){
    if(currentUser?.role!=='admin'){
      toast('Admin access is required');
      return false;
    }

    if(consumePasswordBypassV1024('admin'))return true;

    securePasswordGateV1024({
      kind:'admin',
      action,
      retryTarget:currentRetryTargetV1024()
    });
    return false;
  };
  try{adminPasswordOKV84=window.adminPasswordOKV84}catch(_){}

  /*
    Protected Admin / Settings views used a native prompt inside an older
    showView layer. Authenticate with our modal first, then temporarily
    feed the verified current-user password to that legacy layer without
    displaying the native prompt.
  */
  const showViewV1024=showView;
  window.showView=function(id){
    const protectedViews=['admin','settings','categories','products'];

    if(protectedViews.includes(id)&&secureViewBypassV1024!==id){
      securePasswordGateV1024({
        kind:'current',
        action:`Open ${id==='settings'?'System Settings':id}`,
        retryTarget:()=>{
          /*
            securePasswordGate grants a normal one-use current-user bypass.
            The protected-view flow feeds the already verified password into
            the legacy showView layer directly, so consume that spare token
            here to avoid carrying authorization into the next action.
          */
          window.__scPasswordBypassV1024.current=
            Math.max(0,(window.__scPasswordBypassV1024.current||0)-1);
          secureViewBypassV1024=id;
          showView(id);
        }
      });
      return;
    }

    if(secureViewBypassV1024===id){
      secureViewBypassV1024='';

      const u=(state.users||[]).find(x=>
        x.active!==false &&
        (x.id===currentUser?.id||x.username===currentUser?.username)
      );

      const nativePrompt=window.prompt;
      window.prompt=()=>String(u?.password??'');

      try{
        return showViewV1024(id);
      }finally{
        window.prompt=nativePrompt;
      }
    }

    return showViewV1024(id);
  };
  try{showView=window.showView}catch(_){}

  /* -------------------------------------------------------
     Supabase customer-document storage.
     ------------------------------------------------------- */
  function customerDocKeyV1024(){
    const key=(localStorage.getItem('spgs_supabase_browser_key_v1')||'').trim();
    if(!key)throw new Error('Supabase browser key is not configured on this device.');
    return key;
  }

  function customerDocHeadersV1024(extra={}){
    const key=customerDocKeyV1024();
    const headers={apikey:key,...extra};
    if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
    return headers;
  }

  function customerDocSafePartV1024(value='file'){
    return String(value||'file')
      .normalize?.('NFKD')
      ?.replace(/[^\w.-]+/g,'_')
      ?.replace(/^_+|_+$/g,'')
      ||'file';
  }

  function customerDocExtV1024(file){
    const byName=String(file?.name||'').match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    if(byName)return byName==='jpeg'?'jpg':byName;

    const map={
      'application/pdf':'pdf',
      'image/jpeg':'jpg',
      'image/png':'png',
      'image/webp':'webp'
    };
    return map[file?.type]||'bin';
  }

  function customerDocPathV1024(customerId,kind,file){
    const ext=customerDocExtV1024(file);
    const base=customerDocSafePartV1024(
      String(file?.name||`${kind}.${ext}`).replace(/\.[^.]+$/,'')
    );
    const nonce=(crypto?.randomUUID?.()||uid('docfile')).replace(/[^a-zA-Z0-9_-]/g,'');
    return `customers/${customerDocSafePartV1024(customerId)}/${kind}/${Date.now()}_${nonce}_${base}.${ext}`;
  }

  function customerDocEncodedPathV1024(path=''){
    return String(path)
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  function validateCustomerDocFileV1024(file){
    if(!file)return;
    if(file.size>CUSTOMER_DOC_MAX_BYTES_V1024){
      throw new Error('Certificate file exceeds the 10 MB limit.');
    }

    const allowed=[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if(!allowed.includes(file.type)){
      throw new Error('Certificate must be PDF, JPG, PNG or WEBP.');
    }
  }

  async function uploadCustomerDocV1024(customerId,kind,file){
    validateCustomerDocFileV1024(file);

    const path=customerDocPathV1024(customerId,kind,file);
    const url=
      `${CUSTOMER_DOC_PROJECT_URL_V1024}/storage/v1/object/`+
      `${CUSTOMER_DOC_BUCKET_V1024}/`+
      `${customerDocEncodedPathV1024(path)}`;

    const response=await fetch(url,{
      method:'POST',
      headers:customerDocHeadersV1024({
        'Content-Type':file.type,
        'cache-control':'max-age=3600',
        'x-upsert':'false'
      }),
      body:file
    });

    if(!response.ok){
      let detail='';
      try{detail=await response.text()}catch(_){}
      throw new Error(
        `Supabase certificate upload failed (${response.status})`+
        `${detail?`: ${detail}`:''}. `+
        `Run the supplied customer_documents_policy.sql once if the bucket has not been created.`
      );
    }

    return {
      storage:'supabase',
      bucket:CUSTOMER_DOC_BUCKET_V1024,
      path,
      fileName:file.name||'',
      mime:file.type||'',
      bytes:Number(file.size||0),
      updatedAt:new Date().toISOString(),
      updatedBy:currentUser?.display||currentUser?.username||''
    };
  }

  async function fetchCustomerDocBlobV1024(asset){
    if(!asset?.path)throw new Error('Cloud document path is missing.');

    const url=
      `${CUSTOMER_DOC_PROJECT_URL_V1024}/storage/v1/object/`+
      `${asset.bucket||CUSTOMER_DOC_BUCKET_V1024}/`+
      `${customerDocEncodedPathV1024(asset.path)}`;

    const response=await fetch(url,{
      headers:customerDocHeadersV1024()
    });

    if(!response.ok){
      let detail='';
      try{detail=await response.text()}catch(_){}
      throw new Error(
        `Could not open cloud document (${response.status})`+
        `${detail?`: ${detail}`:''}`
      );
    }

    return response.blob();
  }

  function currentCustomerFromModalV1024(){
    const id=$('custId')?.value||'';
    return state.customers.find(c=>c.id===id)||null;
  }

  function docStatusTextV1024(asset,label){
    if(!asset)return `No ${label} uploaded.`;

    return `Saved in Supabase Cloud • ${asset.fileName||label}`+
      `${asset.updatedAt?` • ${new Date(asset.updatedAt).toLocaleString('en-GB')}`:''}`;
  }

  function updateCustomerDocUIV1024(customer=null){
    const c=customer||currentCustomerFromModalV1024();

    const vatAsset=c?.vatDocument||null;
    const brAsset=c?.brDocument||null;

    if($('custVatDocStatus')){
      $('custVatDocStatus').textContent=
        vatAsset
          ? docStatusTextV1024(vatAsset,'VAT certificate')
          : c?.vatFile
            ? 'Legacy local VAT certificate available. Select a new file to migrate it to Supabase.'
            : 'No VAT certificate uploaded.';
      $('custVatDocStatus').className=
        'customer-cloud-doc-status'+((vatAsset||c?.vatFile)?' saved':'');
    }

    if($('custVatViewBtn')){
      $('custVatViewBtn').style.display=(vatAsset||c?.vatFile)?'inline-block':'none';
    }

    if($('custBrDocStatus')){
      if(brAsset){
        $('custBrDocStatus').textContent=docStatusTextV1024(brAsset,'BR certificate');
        $('custBrDocStatus').className='customer-cloud-doc-status saved';
      }else{
        $('custBrDocStatus').textContent=c?.brNoCertificate
          ? 'Customer is marked as currently having no BR. Pro Forma Invoice is allowed under this temporary No-BR status. Upload the BR when it becomes available.'
          : 'No BR certificate uploaded yet. Customer can be saved, but Pro Forma Invoice is blocked unless the BR is uploaded or the customer is explicitly marked as currently having no BR.';
        $('custBrDocStatus').className='customer-cloud-doc-status override';
      }
    }

    if($('custBrViewBtn')){
      $('custBrViewBtn').style.display=brAsset?'inline-block':'none';
    }
  }

  window.viewCustomerCloudDocumentV1024=async function(kind){
    const c=currentCustomerFromModalV1024();

    if(!c){
      toast('Save the customer first');
      return;
    }

    const asset=kind==='vat'?c.vatDocument:c.brDocument;

    /*
      Backward compatibility: old VAT certificates may still live in the
      local IndexedDB attachment store.
    */
    if(kind==='vat'&&!asset&&c.vatFile){
      try{
        const rec=await getFile(c.vatFile);
        if(!rec?.blob)return toast('Legacy VAT certificate is unavailable on this device');

        const url=URL.createObjectURL(rec.blob);
        window.open(url,'_blank','noopener');
      }catch(err){
        console.error(err);
        toast('Could not open legacy VAT certificate');
      }
      return;
    }

    if(!asset)return toast('No saved certificate is available');

    const popup=window.open('about:blank','_blank');

    try{
      const blob=await fetchCustomerDocBlobV1024(asset);
      const url=URL.createObjectURL(blob);

      if(popup){
        popup.location=url;
      }else{
        window.open(url,'_blank','noopener');
      }

      setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
    }catch(err){
      if(popup)popup.close();
      console.error(err);
      toast(err?.message||'Could not open cloud document');
    }
  };

  /* -------------------------------------------------------
     BR override.
     ------------------------------------------------------- */
  window.updateCustomerBrOverrideUIV1024=function(){
    const noBr=!!$('custNoBr')?.checked;

    /* BR is optional in Customer Master. Keep upload available at all times. */
    if($('custBrCloudFile')){
      $('custBrCloudFile').disabled=false;
    }

    if($('custBrOverrideWrap')){
      $('custBrOverrideWrap').style.display='none';
    }

    if($('custBrAdminPassword')){
      $('custBrAdminPassword').value='';
    }

    const c=currentCustomerFromModalV1024();

    if($('custBrDocStatus')&&!c?.brDocument){
      $('custBrDocStatus').textContent=noBr
        ? 'Customer marked as currently having no BR. Pro Forma Invoice is allowed under this temporary No-BR status. Upload the BR when it becomes available.'
        : 'No BR certificate uploaded yet. Customer can be saved, but Pro Forma Invoice is blocked unless the BR is uploaded or the customer is explicitly marked as currently having no BR.';
      $('custBrDocStatus').className='customer-cloud-doc-status override';
    }
  };

  function adminForPasswordV1024(password){
    return (state.users||[]).find(u=>
      u &&
      u.active!==false &&
      u.role==='admin' &&
      String(u.password??'')===String(password??'')
    )||null;
  }

  /* -------------------------------------------------------
     Assigned System User / Freelancer.
     Existing ownerUser visibility rules then automatically
     scope the customer to the assigned account.
     ------------------------------------------------------- */
  function ensureCustomerAssignedUserFieldV1024(){
    if($('custAssignedSystemUser'))return;

    const intro=$('custIntroducer');
    const notes=$('custNotes')?.closest('.field');

    const html=`
      <div class="field" id="custAssignedSystemUserFieldV1024">
        <label>Introduced By <span class="required-dot">*</span></label>
        <select id="custAssignedSystemUser"></select>
        <div class="hint">Select the system user / freelancer who introduced or manages this customer. This assignment also controls the existing customer ownership / visibility flow.</div>
      </div>
    `;

    if(intro?.closest('.field')){
      intro.closest('.field').insertAdjacentHTML('beforebegin',html);
    }else if(notes){
      notes.insertAdjacentHTML('beforebegin',
        '<div class="section">Customer Introducer / Referral</div>'+html
      );
    }
  }

  function systemUserOptionsV1024(selected=''){
    const users=(state.users||[])
      .filter(u=>u&&u.active!==false)
      .slice()
      .sort((a,b)=>String(a.display||a.username).localeCompare(String(b.display||b.username)));

    return '<option value="">-- Select responsible system user --</option>'+
      users.map(u=>`
        <option value="${esc(u.username)}" ${u.username===selected?'selected':''}>
          ${esc(u.display||u.username)} — ${esc(u.username)} (${esc(u.role||'user')})
        </option>
      `).join('');
  }

  function populateCustomerAssignedUserV1024(customer=null){
    ensureCustomerAssignedUserFieldV1024();

    const c=customer||currentCustomerFromModalV1024();
    const selected=
      c?.ownerUser||
      c?.referralUsername||
      currentUser?.username||
      '';

    $('custAssignedSystemUser').innerHTML=
      systemUserOptionsV1024(selected);

    if(selected&&[...$('custAssignedSystemUser').options].some(o=>o.value===selected)){
      $('custAssignedSystemUser').value=selected;
    }
  }

  /* -------------------------------------------------------
     Existing VAT toggle also controls cloud certificate file.
     ------------------------------------------------------- */
  const updateCustomerVatUIV1024=updateCustomerVatUI;
  window.updateCustomerVatUI=function(){
    const result=updateCustomerVatUIV1024();

    const enabled=$('custVatEnabled')?.value==='yes';

    if($('custVatCloudFile')){
      $('custVatCloudFile').disabled=!enabled;
    }

    return result;
  };
  try{updateCustomerVatUI=window.updateCustomerVatUI}catch(_){}

  /* -------------------------------------------------------
     Final Customer Modal wrapper.
     ------------------------------------------------------- */
  const openCustomerModalV1024=openCustomerModal;
  window.openCustomerModal=function(id=''){
    const result=openCustomerModalV1024(id);
    const c=state.customers.find(x=>x.id===id)||null;

    ensureCustomerAssignedUserFieldV1024();
    populateCustomerAssignedUserV1024(c);

    if($('custVatCloudFile'))$('custVatCloudFile').value='';
    if($('custBrCloudFile'))$('custBrCloudFile').value='';
    if($('custBrAdminPassword'))$('custBrAdminPassword').value='';

    if($('custNoBr')){
      $('custNoBr').checked=!!c?.brNoCertificate;
    }

    updateCustomerVatUI();
    updateCustomerDocUIV1024(c);
    updateCustomerBrOverrideUIV1024();

    /*
      If an existing cloud BR exists, preserve its saved status even after
      the generic BR toggle renderer runs.
    */
    updateCustomerDocUIV1024(c);

    return result;
  };
  try{openCustomerModal=window.openCustomerModal}catch(_){}

  /* -------------------------------------------------------
     Certificate selection status.
     ------------------------------------------------------- */
  $('custVatCloudFile')?.addEventListener('change',()=>{
    const f=$('custVatCloudFile').files?.[0];
    if(!f){
      updateCustomerDocUIV1024();
      return;
    }

    try{
      validateCustomerDocFileV1024(f);
      $('custVatDocStatus').textContent=`Selected: ${f.name} • uploads to Supabase when Customer is saved.`;
      $('custVatDocStatus').className='customer-cloud-doc-status ready';
    }catch(err){
      $('custVatCloudFile').value='';
      toast(err.message);
      updateCustomerDocUIV1024();
    }
  });

  $('custBrCloudFile')?.addEventListener('change',()=>{
    const f=$('custBrCloudFile').files?.[0];
    if(!f){
      updateCustomerDocUIV1024();
      return;
    }

    try{
      validateCustomerDocFileV1024(f);
      if($('custNoBr'))$('custNoBr').checked=false;
      $('custBrDocStatus').textContent=`Selected: ${f.name} • click Save Customer to upload and save the BR before creating a Pro Forma Invoice.`;
      $('custBrDocStatus').className='customer-cloud-doc-status ready';
    }catch(err){
      $('custBrCloudFile').value='';
      toast(err.message);
      updateCustomerDocUIV1024();
    }
  });

  /* -------------------------------------------------------
     Final Customer Save.
     Incorporates customer category, ownership, introducer,
     portal-link refresh and the new Supabase documents.
     ------------------------------------------------------- */
  window.saveCustomer=async function(){
    if(!customerMinimumReady()){
      return toast('Customer Name + Contact Number or Email is required');
    }

    const existingId=$('custId').value||'';
    const old=state.customers.find(c=>c.id===existingId)||{};
    const isExisting=!!old.id;
    const id=existingId||uid('cust');

    if(isExisting&&!protectedEdit('save customer changes'))return;

    const assignedUsername=$('custAssignedSystemUser')?.value||'';
    if(!assignedUsername){
      return customerSaveErrorV1025('Select the Introduced By system user / freelancer.','custAssignedSystemUser');
    }

    const assignedUser=(state.users||[]).find(u=>
      u.active!==false &&
      u.username===assignedUsername
    );

    if(!assignedUser){
      return customerSaveErrorV1025('Selected Introduced By system user is unavailable.','custAssignedSystemUser');
    }

    const requestedNoBr=!!$('custNoBr')?.checked;
    const vatFile=$('custVatCloudFile')?.files?.[0]||null;
    const brFile=$('custBrCloudFile')?.files?.[0]||null;

    /* v1.0.26: BR is optional in Customer Master. It is enforced at PI time. */

    const saveBtn=$('saveCustBtn');
    const oldText=saveBtn?.textContent||'Save Customer';

    if(saveBtn){
      saveBtn.disabled=true;
      saveBtn.textContent='Saving customer...';
    }

    try{
      let vatDocument=old.vatDocument||null;
      let brDocument=old.brDocument||null;

      if(vatFile){
        $('custVatDocStatus').textContent='Uploading VAT certificate to Supabase...';
        $('custVatDocStatus').className='customer-cloud-doc-status ready';
        vatDocument=await uploadCustomerDocV1024(id,'vat',vatFile);
      }

      if(brFile){
        $('custBrDocStatus').textContent='Uploading BR certificate to Supabase...';
        $('custBrDocStatus').className='customer-cloud-doc-status ready';
        brDocument=await uploadCustomerDocV1024(id,'br',brFile);
      }

      const noBr=!brDocument&&requestedNoBr;

      const priceCategoryIds=
        [...document.querySelectorAll('input[name="custCat"]:checked')]
          .map(x=>x.value);

      const c={
        ...old,
        id,

        name:$('custName').value.trim(),
        contactPerson:$('custContactPerson').value.trim(),
        phone:$('custPhone').value.trim(),
        email:$('custEmail').value.trim(),

        vatEnabled:$('custVatEnabled').value==='yes',
        vat:$('custVat').value.trim(),

        paymentMode:$('custPaymentMode').value,
        creditDays:Number($('custCreditDays').value||0),
        creditLimit:Number($('custCreditLimit').value||0),

        address:$('custAddress').value.trim(),
        delivery:$('custDelivery').value.trim(),
        map:$('custMap').value.trim(),
        notes:$('custNotes').value.trim(),

        /*
          Old fields are preserved but no longer editable from Customer UI.
        */
        specialPrices:old.specialPrices||{},
        sourceFile:old.sourceFile||null,
        vatFile:old.vatFile||null,

        vatDocument,
        brDocument,

        brNoCertificate:noBr,
        brOverrideApprovedByUser:'',
        brOverrideApprovedByDisplay:'',
        brOverrideApprovedAt:'',

        priceCategoryIds,

        /*
          Freelancer / system-user ownership.
          ownerUser is intentionally used because the existing access layer
          already limits non-admin customer visibility using this field.
        */
        ownerUser:assignedUser.username,
        assignedUserId:assignedUser.id,
        assignedUserDisplay:assignedUser.display||assignedUser.username,
        referralUserId:assignedUser.id,
        referralUsername:assignedUser.username,
        referralDisplay:assignedUser.display||assignedUser.username,

        /*
          Existing Introducer / Commission master remains available.
        */
        introducerId:$('custIntroducer')?.value||old.introducerId||'',
        introRuleType:$('custIntroType')?.value||old.introRuleType||'default',
        introRate:Number($('custIntroRate')?.value??old.introRate??0),
        introBasis:$('custIntroBasis')?.value||old.introBasis||'net',

        updatedAt:new Date().toISOString(),
        updatedBy:currentUser?.display||currentUser?.username||''
      };

      const index=state.customers.findIndex(x=>x.id===id);

      if(index>=0){
        state.customers[index]=c;
      }else{
        state.customers.push(c);
      }

      audit(
        index>=0?'EDIT_CUSTOMER':'ADD_CUSTOMER',
        `${c.name} • Assigned to ${c.assignedUserDisplay}`
      );

      if(vatFile){
        audit('CUSTOMER_VAT_CERTIFICATE_UPLOAD',`${c.name} • ${vatDocument.fileName}`);
      }

      if(brFile){
        audit('CUSTOMER_BR_CERTIFICATE_UPLOAD',`${c.name} • ${brDocument.fileName}`);
      }

      if(!brDocument){
        audit(
          'CUSTOMER_SAVED_WITHOUT_BR',
          `${c.name} • Pro Forma Invoice blocked until BR is uploaded and saved`
        );
      }

      if(old.ownerUser!==c.ownerUser){
        audit(
          'CUSTOMER_SYSTEM_USER_ASSIGNMENT',
          `${c.name} • ${old.ownerUser||'Unassigned'} → ${c.ownerUser}`
        );
      }

      saveState();
      refreshCustomerPick();
      renderCustomers();

      if(typeof refreshUserCompanyLinkOptions==='function'&&$('userCompanyLinkType')){
        const keep=$('userCompanyLinkId')?.value||id;
        $('userCompanyLinkType').value='customer';
        refreshUserCompanyLinkOptions(keep);
      }

      closeModal('customerModal');

      if($('customerSelect')){
        $('customerSelect').value=id;
        fillCustomer(id);
      }

      calculateLabelPrice();
      clearCustomerSaveErrorV1025();
      if(c.brDocument){
        toast('Customer saved');
      }else{
        toast('Customer saved — BR not added. Upload and Save Customer with the BR before creating a Pro Forma Invoice.');
      }

    }catch(err){
      console.error('Customer save failed',err);
      toast(`Customer save failed${err?.message?': '+err.message:''}`);

    }finally{
      if(saveBtn){
        saveBtn.disabled=!customerMinimumReady();
        saveBtn.textContent=oldText;
      }

      if($('custBrAdminPassword')){
        $('custBrAdminPassword').value='';
      }
    }
  };
  try{saveCustomer=window.saveCustomer}catch(_){}

  /* -------------------------------------------------------
     Customer list: show assigned system user.
     ------------------------------------------------------- */
  const renderCustomersV1024=renderCustomers;
  window.renderCustomers=function(){
    const result=renderCustomersV1024();

    document.querySelectorAll('#customerList tbody tr').forEach(tr=>{
      const editBtn=[...tr.querySelectorAll('button[onclick]')]
        .find(b=>(b.getAttribute('onclick')||'').includes('openCustomerModal('));

      const id=(editBtn?.getAttribute('onclick')||'')
        .match(/openCustomerModal\('([^']+)'\)/)?.[1];

      const c=state.customers.find(x=>x.id===id);
      if(!c)return;

      const user=(state.users||[]).find(u=>u.username===c.ownerUser);
      const cell=tr.querySelector('td');

      if(cell&&!cell.querySelector('.customer-assigned-user-v1024')){
        cell.insertAdjacentHTML(
          'beforeend',
          `<div class="small customer-assigned-user-v1024">Assigned user: <b>${esc(user?.display||c.assignedUserDisplay||c.ownerUser||'Unassigned')}</b></div>`
        );
      }
    });

    return result;
  };
  try{renderCustomers=window.renderCustomers}catch(_){}

  /*
    Customer save readiness text no longer refers to removed auto-fill.
  */
  const updateCustomerSaveStateV1024=updateCustomerSaveState;
  window.updateCustomerSaveState=function(){
    updateCustomerSaveStateV1024();

    const ok=customerMinimumReady();
    if($('custSaveNote')){
      $('custSaveNote').textContent=
        ok
          ? 'Ready to save.'
          : 'Minimum: Customer Name + Contact Number or Email';
    }
  };
  try{updateCustomerSaveState=window.updateCustomerSaveState}catch(_){}

  /* -------------------------------------------------------
     v1.0.25 — Customer update UX / referral assignment fix
     ------------------------------------------------------- */

  window.clearCustomerSaveErrorV1025=function(){
    const box=$('custSaveErrorV1025');
    if(!box)return;
    box.textContent='';
    box.style.display='none';
  };

  window.customerSaveErrorV1025=function(message,focusId=''){
    let box=$('custSaveErrorV1025');

    if(!box){
      const actions=$('saveCustBtn')?.closest('.actions');
      if(actions){
        actions.insertAdjacentHTML(
          'beforebegin',
          '<div id="custSaveErrorV1025" class="customer-save-error-v1025" style="display:none"></div>'
        );
        box=$('custSaveErrorV1025');
      }
    }

    if(box){
      box.textContent=message;
      box.style.display='block';
      box.scrollIntoView({behavior:'smooth',block:'center'});
    }

    /*
      Modal sits above the legacy toast layer, so also raise the toast
      via CSS and keep this inline error visible inside the modal.
    */
    toast(message);

    const target=focusId?$(focusId):null;
    if(target){
      setTimeout(()=>{
        try{
          target.focus({preventScroll:true});
        }catch(_){
          target.focus?.();
        }
      },120);
    }

    return false;
  };

  function configureCustomerReferralUIV1025(){
    ensureCustomerAssignedUserFieldV1024();

    const assigned=$('custAssignedSystemUser');
    if(assigned?.closest('.field')){
      assigned.closest('.field').style.display='';
    }

    /*
      The old Introducer Master / commission controls are retained in DOM
      only for legacy records and commission history. They are no longer
      the visible "Introduced By" field. The visible field is now the
      System User / Freelancer dropdown requested for customer ownership.
    */
    ['custIntroducer','custIntroType','custIntroRate','custIntroBasis','custIntroHint']
      .forEach(id=>{
        const el=$(id);
        const field=el?.closest('.field');
        if(field)field.style.display='none';
      });
  }

  const populateCustomerAssignedUserV1025=populateCustomerAssignedUserV1024;
  populateCustomerAssignedUserV1024=function(customer=null){
    populateCustomerAssignedUserV1025(customer);

    const sel=$('custAssignedSystemUser');
    if(sel){
      /*
        Existing customers without ownerUser are assigned to the currently
        logged-in user only as the UI default. The value is persisted only
        after Save Customer is successfully completed.
      */
      const c=customer||currentCustomerFromModalV1024();
      const selected=
        c?.ownerUser||
        c?.referralUsername||
        currentUser?.username||
        '';

      if(selected&&[...sel.options].some(o=>o.value===selected)){
        sel.value=selected;
      }
    }
  };

  const openCustomerModalV1025=openCustomerModal;
  window.openCustomerModal=function(id=''){
    const result=openCustomerModalV1025(id);
    const c=state.customers.find(x=>x.id===id)||null;

    configureCustomerReferralUIV1025();
    populateCustomerAssignedUserV1024(c);
    clearCustomerSaveErrorV1025();

    /*
      Legacy customer with no BR:
      make the compliance reason obvious immediately instead of allowing a
      later save attempt to look like it silently failed.
    */
    if(c && !c.brDocument && !c.brNoCertificate){
      const status=$('custBrDocStatus');
      if(status){
        status.textContent=
          'This customer has no BR certificate on file and is not marked as "currently no BR". Upload and save the BR, or turn on the No-BR option before creating a Pro Forma Invoice.';
        status.className='customer-cloud-doc-status override';
      }
    }

    return result;
  };
  try{openCustomerModal=window.openCustomerModal}catch(_){}

  /*
    The old referral/commission dropdown is now hidden. Preserve its
    existing value instead of accidentally changing legacy commission data
    while the new visible Introduced By field updates ownerUser.
  */
  const saveCustomerV1025=saveCustomer;
  window.saveCustomer=async function(){
    clearCustomerSaveErrorV1025();

    const existingId=$('custId')?.value||'';
    const old=state.customers.find(c=>c.id===existingId)||null;
    const legacyIntroducerId=old?.introducerId||'';
    const legacyIntroRuleType=old?.introRuleType||'default';
    const legacyIntroRate=old?.introRate??0;
    const legacyIntroBasis=old?.introBasis||'net';

    const result=await saveCustomerV1025();

    /*
      Final save function already stores the selected system user into
      ownerUser / referralUsername. Restore the hidden legacy commission
      introducer fields so this UI change cannot rewrite old commission
      assignments.
    */
    const savedId=existingId||$('customerSelect')?.value||'';
    const c=state.customers.find(x=>x.id===savedId);

    if(c && old){
      let changed=false;

      if(c.introducerId!==legacyIntroducerId){
        c.introducerId=legacyIntroducerId;
        changed=true;
      }
      if(c.introRuleType!==legacyIntroRuleType){
        c.introRuleType=legacyIntroRuleType;
        changed=true;
      }
      if(Number(c.introRate||0)!==Number(legacyIntroRate||0)){
        c.introRate=Number(legacyIntroRate||0);
        changed=true;
      }
      if(c.introBasis!==legacyIntroBasis){
        c.introBasis=legacyIntroBasis;
        changed=true;
      }

      if(changed)saveState();
    }

    return result;
  };
  try{saveCustomer=window.saveCustomer}catch(_){}

  configureCustomerReferralUIV1025();

  ensureSecurePasswordModalV1024();
  ensureCustomerAssignedUserFieldV1024();
  enhanceAllPasswordInputsV1024(document);

})();
