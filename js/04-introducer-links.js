
/* V8.6 - Mandatory user company / introducer link and portal customer auto-fill */
(function(){
 const css=document.createElement('style');css.textContent='.linked-profile{border:1px solid #a8d8da;background:#f0fbfb;border-radius:12px;padding:11px;margin-bottom:10px}.linked-profile .company-name{font-size:15px;font-weight:1000;color:#087f83}.profile-source{display:inline-block;margin-top:5px;padding:3px 7px;border-radius:999px;background:#dff2f2;color:#087f83;font-size:9px;font-weight:900}.readonly-profile input,.readonly-profile textarea{background:#f4f7f8;color:#344b53}.link-warning{background:#fff4da;border:1px solid #e8c664;color:#7b5800;padding:8px;border-radius:9px;font-size:10px;margin-top:6px}';document.head.appendChild(css);

 // Add a linked customer selector to the branch request form.
 const customerField=$('bpCustomer')?.closest('.field');
 if(customerField){
   customerField.insertAdjacentHTML(
     'beforebegin',
     `<div class="field full" id="bpCustomerProfileField"><label>Customer / Company Profile</label><select id="bpCustomerProfile" onchange="loadBranchCustomerProfile()"></select><div class="hint">Only the signed-in user's linked company, owned customers and introducer-linked customers are shown.</div></div><div id="bpLinkedProfile" class="field full linked-profile"></div>`
   );
   const requestCard=customerField.closest('.portal-card');if(requestCard)requestCard.classList.add('readonly-profile');
   ['bpCustomer','bpPhone','bpEmail','bpAddress'].forEach(id=>{const e=$(id);if(e)e.readOnly=true});
 }

 function activeUserRecord(){return state.users.find(u=>u.id===currentUser?.id||u.username===currentUser?.username)}

 function directPortalCustomer(){
   const u=activeUserRecord();
   return currentUser?.role!=='admin' && u?.companyLinkType==='customer';
 }

 function customerPortalProfile(c,source){
   if(!c)return null;
   const vatEnabled=c.vatEnabled!==undefined?!!c.vatEnabled:!!c.vat;
   return {
     kind:'customer',
     id:c.id,
     name:c.name,
     phone:c.phone||'',
     email:c.email||'',
     address:c.address||'',
     delivery:c.delivery||c.address||'',
     paymentMode:c.paymentMode==='cash'?'cash':'credit',
     vatMode:vatEnabled?'vat18':'none',
     source:source||'Customer'
   }
 }

 function linkedEntity(u=activeUserRecord()){
   if(!u)return null;
   if(u.companyLinkType==='customer'){
     const c=state.customers.find(x=>x.id===u.companyLinkId);
     return c?customerPortalProfile(c,`Linked company/customer • ${c.name}`):null
   }
   if(u.companyLinkType==='introducer'){
     const i=state.introducers.find(x=>x.id===u.companyLinkId);
     return i?{kind:'introducer',id:i.id,name:i.name,phone:i.phone||'',email:i.email||'',address:i.address||i.notes||'',source:`Linked branch / introducer • ${i.name}`} : null
   }
   return null
 }

 function portalCustomerProfiles(){
   const u=activeUserRecord(),linked=linkedEntity(u),map=new Map(),add=x=>{if(x&&x.name)map.set(`${x.kind}:${x.id}`,x)};
   add(linked);
   (state.customers||[]).filter(c=>c.ownerUser===u?.username).forEach(c=>add(customerPortalProfile(c,'My customer')));
   if(u?.companyLinkType==='introducer')(state.customers||[]).filter(c=>c.introducerId===u.companyLinkId).forEach(c=>add(customerPortalProfile(c,'Introducer-linked customer')));
   return [...map.values()]
 }

 function applyBranchPortalCustomerMode(){

   const customerMode=directPortalCustomer();

   [
     'bpCustomerField',
     'bpPhoneField',
     'bpEmailField',
     'bpAddressField',
     'bpPayModeField',
     'bpVatField',
     'bpDeliveryAddressField'
   ].forEach(id=>{
     const el=$(id);
     if(el)el.style.display=customerMode?'none':'';
   });

   const profileField=$('bpCustomerProfileField');
   if(profileField)profileField.style.display=customerMode?'none':'';

   const profileBanner=$('bpLinkedProfile');
   if(profileBanner)profileBanner.style.display=customerMode?'none':'';

   const deliveryToggle=$('bpCustomerSeparateDeliveryBlock');
   if(deliveryToggle)deliveryToggle.style.display=customerMode?'':'none';

   if(!customerMode){
     if($('bpSeparateDelivery'))$('bpSeparateDelivery').checked=false;
     if(typeof toggleBpSeparateDelivery==='function')toggleBpSeparateDelivery();
   }
 }

 window.refreshBranchCustomerProfiles=function(){
   const sel=$('bpCustomerProfile');if(!sel)return;const list=portalCustomerProfiles(),u=activeUserRecord(),linked=linkedEntity(u),customerMode=directPortalCustomer();
   const preferred=customerMode&&linked?`${linked.kind}:${linked.id}`:(u?.lastPortalCustomerKey||(linked?`${linked.kind}:${linked.id}`:''));
   sel.innerHTML=list.length?list.map(x=>`<option value="${esc(x.kind+':'+x.id)}" ${x.kind+':'+x.id===preferred?'selected':''}>${esc(x.name)} — ${esc(x.source)}</option>`).join(''):'<option value="">No linked company/customer available</option>';
   if(preferred&&[...sel.options].some(o=>o.value===preferred))sel.value=preferred;
   loadBranchCustomerProfile();
   applyBranchPortalCustomerMode();
 };

 window.loadBranchCustomerProfile=function(){
   const key=$('bpCustomerProfile')?.value,x=portalCustomerProfiles().find(p=>`${p.kind}:${p.id}`===key),u=activeUserRecord();
   if(u&&key){u.lastPortalCustomerKey=key;saveState()}

   $('bpCustomer').value=x?.name||'';
   $('bpPhone').value=x?.phone||'';
   $('bpEmail').value=x?.email||'';
   $('bpAddress').value=x?.address||'';

   if(directPortalCustomer()){
     $('bpPayMode').value=x?.paymentMode==='cash'?'cash':'credit';
     $('bpVat').value=x?.vatMode==='vat18'?'vat18':'none';
     $('bpDeliveryAddress').value=x?.delivery||x?.address||'';
   }

   $('bpLinkedProfile').innerHTML=x?`<div class="company-name">${esc(x.name)}</div><div>${esc(x.phone||'No phone')} ${x.email?'• '+esc(x.email):''}</div><div class="small">${esc(x.address||'No address saved')}</div><span class="profile-source">${esc(x.source)}</span>`:'<div class="link-warning"><b>No company profile linked.</b> Ask the administrator to link this user to a Customer/Company or Introducer profile.</div>';

   applyBranchPortalCustomerMode();
 };

 // Extend User Management with mandatory organisation association.
 const handlerField=$('userQuoteHandler')?.closest('.field');
 if(handlerField)handlerField.insertAdjacentHTML('afterend',`<div class="field"><label>User Organisation Type</label><select id="userCompanyLinkType" onchange="refreshUserCompanyLinkOptions()"><option value="customer">Customer / Company Master</option><option value="introducer">Introducer / Branch Network</option></select></div><div class="field"><label>Linked Company / Introducer</label><select id="userCompanyLinkId"></select></div><div class="field full"><div class="actions"><button class="btn ghost sm" type="button" onclick="openCustomerModal()">+ Create Company / Customer</button><button class="btn ghost sm" type="button" onclick="showView('introducers')">Manage Introducers</button></div><div class="hint">Required when Branch Approved Price Portal privilege is selected. Save the company/customer first, then return here and select it.</div></div>`);
 window.refreshUserCompanyLinkOptions=function(selected=''){
   const type=$('userCompanyLinkType')?.value||'customer',a=type==='introducer'?(state.introducers||[]).filter(x=>x.active!==false):(state.customers||[]);
   $('userCompanyLinkId').innerHTML='<option value="">-- Select required profile --</option>'+a.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)}${x.phone?' • '+esc(x.phone):''}</option>`).join('')
 };
 const renderUser86=renderUserPrivilegeEditor;
 renderUserPrivilegeEditor=function(u=null){renderUser86(u);if($('userCompanyLinkType')){$('userCompanyLinkType').value=u?.companyLinkType||'customer';refreshUserCompanyLinkOptions(u?.companyLinkId||'')}};
 const saveUser86=saveSystemUserV6;
 saveSystemUserV6=function(){
   const id=$('editUserId').value,username=$('newUsername').value.trim(),needsPortal=[...document.querySelectorAll('input[name="userPerm"]:checked')].some(x=>x.value==='branch_portal'),type=$('userCompanyLinkType')?.value||'',linkId=$('userCompanyLinkId')?.value||'';
   if($('newUserRole').value!=='admin'&&needsPortal&&!linkId)return toast('Link a Customer/Company or Introducer before saving this Branch Portal user');
   saveUser86();const u=state.users.find(x=>id?x.id===id:x.username===username);if(u){u.companyLinkType=linkId?type:'';u.companyLinkId=linkId;saveState();renderUsers();renderUserPrivilegeEditor(null)}
 };
 const renderUsers86=renderUsers;
 renderUsers=function(){renderUsers86();document.querySelectorAll('#userList tbody tr').forEach(tr=>{const username=tr.querySelector('.small')?.textContent?.split('\n')[0],u=state.users.find(x=>x.username===username),x=linkedEntity(u);if(u)tr.children[0]?.insertAdjacentHTML('beforeend',x?`<div class="small"><b>Company:</b> ${esc(x.name)} • ${esc(x.kind)}</div>`:'<div class="small" style="color:#a86b00">Company not linked</div>')})};

 // The portal request always uses a selected linked profile; manual blank entries are blocked.
 const submit86=submitBranchQuoteRequest;
 submitBranchQuoteRequest=function(){
   const key=$('bpCustomerProfile')?.value,x=portalCustomerProfiles().find(p=>`${p.kind}:${p.id}`===key);
   if(!x)return toast('No linked customer/company is available for this user');

   if(directPortalCustomer()){

     /* Customer/company fields are hidden, so always refresh their values
        directly from Customer Master immediately before submission. */
     $('bpCustomer').value=x.name||'';
     $('bpPhone').value=x.phone||'';
     $('bpEmail').value=x.email||'';
     $('bpAddress').value=x.address||'';
     $('bpPayMode').value=x.paymentMode==='cash'?'cash':'credit';
     $('bpVat').value=x.vatMode==='vat18'?'vat18':'none';

     const separate=!!$('bpSeparateDelivery')?.checked;

     if(separate){
       const line1=$('bpDeliveryLine1')?.value.trim()||'';
       const line2=$('bpDeliveryLine2')?.value.trim()||'';
       const contact1=$('bpDeliveryContact1')?.value.trim()||'';

       if(!line1){$('bpDeliveryLine1')?.focus();return toast('Address Line 1 is required')}
       if(!line2){$('bpDeliveryLine2')?.focus();return toast('Address Line 2 is required')}
       if(!contact1){$('bpDeliveryContact1')?.focus();return toast('Delivery contact number is required')}

       $('bpDeliveryAddress').value=[line1,line2].filter(Boolean).join(', ');
     }else{
       $('bpDeliveryAddress').value=x.delivery||x.address||'';
     }
   }

   const before=(state.quoteRequests||[]).length;
   const result=submit86();

   /* Base submit clears the form. Restore hidden Customer Master values
      for the next request only after a request was actually created. */
   if(directPortalCustomer() && (state.quoteRequests||[]).length>before){
     loadBranchCustomerProfile();
     if($('bpSeparateDelivery'))$('bpSeparateDelivery').checked=false;
     ['bpDeliveryLine1','bpDeliveryLine2','bpDeliveryContact1','bpDeliveryContact2'].forEach(id=>{if($(id))$(id).value=''});
     if(typeof toggleBpSeparateDelivery==='function')toggleBpSeparateDelivery();
   }

   return result
 };
 const show86=showView;showView=function(id){const r=show86(id);if(id==='branchportal')refreshBranchCustomerProfiles();if(id==='settings')renderUserPrivilegeEditor($('editUserId')?.value?state.users.find(x=>x.id===$('editUserId').value):null);return r};
 const login86=loginUser;loginUser=function(){login86();if(currentUser)refreshBranchCustomerProfiles()};
 const restore86=restoreSession;restoreSession=function(){restore86();if(currentUser)refreshBranchCustomerProfiles()};
 const refresh86=refreshAll;refreshAll=function(){refresh86();refreshUserCompanyLinkOptions();refreshBranchCustomerProfiles();if($('productionproducts'))renderProductionProducts()};
 const saveCustomer86=saveCustomer;saveCustomer=async function(){await saveCustomer86();if($('userCompanyLinkType')){const newest=state.customers[state.customers.length-1],keep=$('userCompanyLinkId')?.value||newest?.id||'';$('userCompanyLinkType').value='customer';refreshUserCompanyLinkOptions(keep)}};

 // Migration: known existing branch users remain usable, but admin can see which accounts still need a link.
 state.users.forEach(u=>{u.companyLinkType=u.companyLinkType||'';u.companyLinkId=u.companyLinkId||''});saveState();
 renderUserPrivilegeEditor(null);refreshBranchCustomerProfiles();renderUsers();
})();
