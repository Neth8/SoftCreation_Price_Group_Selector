/* V1.1.31: remember-me token and Ordexa tracking read-only integration.
   Requires INSTALL_SESSION_TRACKING_20261104.sql before remember-me/Ordexa tracking are enabled.
   Keeps existing SPGS login, password checks, and user permission logic intact. */
(function(){
 'use strict';
 const REST='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
 const TOKEN='spgs_remember_token_v1131';
 const SESSION='spgs_session_token_v1131';
 const KEY='spgs_supabase_browser_key_v1';
 let loggingIn=false, restoring=false, trackingLoading=false, lastTrackingAt=0;
 function apiHeaders(){
   const k=localStorage.getItem(KEY)||'';
   if(!k)throw new Error('Supabase publishable key is not configured');
   return {apikey:k, ...(k.startsWith('eyJ')?{Authorization:'Bearer '+k}:{}),'Content-Type':'application/json'};
 }
 async function rpc(name,args){
   const r=await fetch(REST+'/rpc/'+name,{method:'POST',headers:apiHeaders(),body:JSON.stringify(args)});
   const t=await r.text(); if(!r.ok)throw new Error('Supabase '+r.status+': '+t.slice(0,250));
   return t?JSON.parse(t):null;
 }
 function getToken(){return sessionStorage.getItem(SESSION)||localStorage.getItem(TOKEN)||'';}
 function showWarning(t){const e=document.getElementById('loginError');if(e){e.style.display='block';e.textContent=t;}else console.warn(t);}
 // Use server-generated opaque token. Never store username/password in remember storage.
 const baseLogin=window.loginUser;
 window.loginUser=async function(){
   if(loggingIn)return;
   loggingIn=true;
   try{
     const u=document.getElementById('loginUser')?.value?.trim()||'';
     const password=document.getElementById('loginPass')?.value||'';
     const remembered=!!document.getElementById('spgsRememberMe')?.checked;
     if(!u||!password){showWarning('Enter username and password');return;}
     // Always verify against server before enabling long-lived login.
     let issued=null;
     try{issued=await rpc('spgs_issue_session_v1131',{p_username:u,p_password:password,p_remember:remembered});}
     catch(e){
       if(remembered){showWarning('Remember Me unavailable. Apply the supplied session SQL first. '+e.message);return;}
       // Legacy normal login is still available during rollout.
       console.warn('Server session endpoint not ready; using existing non-remembered login',e);
     }
     const result=await baseLogin.apply(this,arguments);
     if(typeof currentUser!=='undefined' && currentUser?.username===u){
       if(issued?.token){
         if(remembered){localStorage.setItem(TOKEN,issued.token);sessionStorage.removeItem(SESSION);}
         else{sessionStorage.setItem(SESSION,issued.token);localStorage.removeItem(TOKEN);}
       }
       document.getElementById('loginPass').value='';
       if(issued?.token)void refreshTracking(true);
     }
     return result;
   }finally{loggingIn=false;}
 };
 const baseLogout=window.logoutUser;
 window.logoutUser=function(){
   const token=getToken();localStorage.removeItem(TOKEN);sessionStorage.removeItem(SESSION);
   const r=baseLogout.apply(this,arguments);
   if(token)rpc('spgs_revoke_session_v1131',{p_token:token}).catch(e=>console.warn('Session revocation failed',e));
   const b=document.getElementById('spgsOrdexaTracking');if(b)b.remove();
   return r;
 };
 async function restoreRemembered(){
   if(restoring||typeof currentUser==='undefined'||currentUser||!localStorage.getItem(TOKEN))return;
   if(!Array.isArray(state?.users)||!state.users.length)return;
   restoring=true;
   try{
     const result=await rpc('spgs_validate_session_v1131',{p_token:localStorage.getItem(TOKEN)});
     if(!result?.username)throw new Error('Session expired');
     const user=state.users.find(x=>x.username===result.username&&x.active!==false);
     if(!user)throw new Error('Account not available');
     currentUser={id:user.id,username:user.username,display:user.display,role:user.role,permissions:user.permissions||[],priceCategoryIds:user.priceCategoryIds||[]};
     sessionStorage.setItem('sc_active_user_v75_clean',JSON.stringify(currentUser));
     sessionStorage.setItem('sc_active_user',JSON.stringify(currentUser));
     document.getElementById('loginScreen').style.display='none';
     document.getElementById('currentUserChip').textContent=currentUser.display+' • '+currentUser.role;
     try{applyUserAccess()}catch(e){console.warn(e)}
     try{window.refreshShellProfile?.()}catch(_){}
     void refreshTracking(true);
   }catch(e){localStorage.removeItem(TOKEN);console.warn('Remembered login expired or invalid',e)}
   finally{restoring=false;}
 }
 // Bootstrap is async; don't touch app login until authoritative users arrive.
 const restoreTimer=setInterval(()=>{
   if(typeof currentUser!=='undefined'&&currentUser){clearInterval(restoreTimer);return;}
   if(typeof state!=='undefined'&&state?.users?.length){void restoreRemembered();}
 },1200);
 setTimeout(()=>clearInterval(restoreTimer),20000);

 const escHtml=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function refreshTracking(force=false){
   if(trackingLoading||document.hidden||typeof currentUser==='undefined'||!currentUser||!getToken())return;
   if(!force&&Date.now()-lastTrackingAt<12000)return;
   if(!force&&!document.getElementById('dealerfulfilment')?.classList.contains('active'))return;
   trackingLoading=true;
   try{
     const rows=await rpc('spgs_ordexa_tracking_v1131',{p_token:getToken()});
     lastTrackingAt=Date.now();
     const host=document.getElementById('dfList');if(!host)return;
     let panel=document.getElementById('spgsOrdexaTracking');
     if(!panel){panel=document.createElement('div');panel.id='spgsOrdexaTracking';panel.className='panel';host.parentElement.insertBefore(panel,host);}
     const nonempty=(Array.isArray(rows)?rows:[]).filter(x=>x.tracking);
     panel.innerHTML='<div class="panel-title">Ordexa Courier Tracking <span class="small">(automatically refreshed)</span></div><div class="panel-body">'+
       (nonempty.length?'<div style="overflow-x:auto"><table class="table"><thead><tr><th>Sales Order</th><th>Delivery</th><th>Courier</th><th>Tracking</th><th>Recorded</th></tr></thead><tbody>'+nonempty.map(x=>'<tr><td>'+escHtml(x.sales_order_no||'-')+'</td><td>'+escHtml(x.delivery_order_no||x.delivery_id||'-')+'</td><td>'+escHtml(x.courier||'-')+'</td><td><b>'+escHtml(x.tracking)+'</b> <button class="btn ghost sm" data-copy-track="'+escHtml(x.tracking)+'">Copy</button></td><td>'+escHtml(x.updated_at||'-')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="small">No courier tracking recorded in Ordexa yet.</div>')+'</div>';
     panel.querySelectorAll('[data-copy-track]').forEach(btn=>btn.addEventListener('click',()=>navigator.clipboard.writeText(btn.dataset.copyTrack)));
   }catch(e){console.warn('Ordexa tracking read unavailable:',e);}
   finally{trackingLoading=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshTracking(true)});
 setInterval(()=>{void refreshTracking(false)},12000);
 window.spgsRefreshOrdexaTrackingV1131=()=>refreshTracking(true);
})();
