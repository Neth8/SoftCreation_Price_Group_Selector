/* SPGS Sales Order cancellation — isolated module; normal save/login flows unchanged. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let selected=null,busy=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ensure(){
 if($('scCancelModalV2'))return;
 const host=document.createElement('div');host.id='scCancelModalV2';host.className='modal';host.innerHTML=`<div class="modal-card" style="max-width:540px"><div class="modal-head"><div><b>Cancel Sales Order</b><div class="small">Original receipts stay in the audit trail.</div></div><button class="closex" type="button" onclick="scCloseCancelOrderV2()">×</button></div><div class="modal-body"><div id="scCancelOrderMetaV2" class="notice"></div><div class="field" style="margin-top:14px"><label>Reason for cancellation (required)</label><textarea id="scCancelReasonV2" rows="3" maxlength="500" placeholder="Enter the customer's cancellation reason"></textarea></div><div class="field" style="margin-top:12px"><label>Your existing SPGS login password</label><input type="password" id="scCancelPasswordV2" autocomplete="off" placeholder="Enter your password"/></div><div id="scCancelErrorV2" class="small" style="color:#b42318;min-height:18px;margin-top:8px"></div><div class="actions" style="margin-top:16px"><button id="scCancelSubmitV2" class="btn red" type="button" onclick="scConfirmCancelOrderV2()">Confirm cancellation & print notices</button><button class="btn ghost" type="button" onclick="scCloseCancelOrderV2()">Back</button></div></div></div>`;
 document.body.appendChild(host);
 const viewHead=$('bpSoViewModalV1030')?.querySelector('.modal-head > div:last-child');
 if(viewHead && !$('scCancelViewBtnV2')){const b=document.createElement('button');b.id='scCancelViewBtnV2';b.className='btn red sm';b.textContent='Cancel Order';b.style.display='none';b.onclick=()=>window.scOpenCancelOrderV2(b.dataset.soId);viewHead.insertBefore(b,viewHead.firstChild);}
}
window.scOpenCancelOrderV2=function(id){
 ensure();const so=(state?.salesOrders||[]).find(x=>String(x.id)===String(id));
 const user=currentUser;
 if(!so || !user || !(user.role==='admin'||so.ownerUser===user.username)){window.toast?.('Cancellation is allowed only for Admin or the order creator.');return;}
 if(so.cancelledAt||String(so.status||'').toLowerCase()==='cancelled'){window.toast?.('Already cancelled');return;}
 selected=so;$('scCancelOrderMetaV2').innerHTML='<b>'+esc(so.soNo||so.id)+'</b><div class="small">'+esc(so.customerName||'')+'</div>';
 $('scCancelReasonV2').value='';$('scCancelPasswordV2').value='';$('scCancelErrorV2').textContent='';
 if(typeof window.openModal==='function')window.openModal('scCancelModalV2');else $('scCancelModalV2').classList.add('show');
 setTimeout(()=>$('scCancelReasonV2')?.focus(),0);
};
window.scCloseCancelOrderV2=function(){if(busy)return;selected=null;if(typeof window.closeModal==='function')window.closeModal('scCancelModalV2');else $('scCancelModalV2').classList.remove('show');};
window.scConfirmCancelOrderV2=async function(){
 if(busy||!selected)return;const reason=$('scCancelReasonV2').value.trim(),password=$('scCancelPasswordV2').value;
 if(reason.length<5){$('scCancelErrorV2').textContent='Provide a meaningful reason (at least five characters).';return;}
 if(!password){$('scCancelErrorV2').textContent='Password required.';return;}
 const user=currentUser;if(!user)return;
 busy=true;$('scCancelSubmitV2').disabled=true;$('scCancelErrorV2').textContent='Verifying and saving...';
 try{
  if(typeof window.spgsCancelSalesOrderRPCV2!=='function')throw Error('Cloud cancellation service unavailable');
  const result=await window.spgsCancelSalesOrderRPCV2({p_source_so_id:String(selected.id),p_username:user.username,p_password:password,p_reason:reason});
  if(!result?.success)throw Error(result?.error||'Cancellation was not confirmed');
  selected.status='Cancelled';selected.cancelledAt=result.cancelled_at;selected.cancellationReason=reason;selected.cancelledBy=user.username;selected.updatedAt=new Date().toISOString();
  if(typeof window.saveState==='function')window.saveState();
  if(typeof window.bpSoRefreshV1030==='function')window.bpSoRefreshV1030();
  if(typeof window.renderSalesOrders91==='function')window.renderSalesOrders91();
  const modal=$('scCancelModalV2'); selected=null;if(typeof window.closeModal==='function')window.closeModal('scCancelModalV2');else modal.classList.remove('show');
  window.toast?.('Sales Order cancelled. '+(result.print_jobs||0)+' cancellation receipts queued.');
 }catch(e){$('scCancelErrorV2').textContent=String(e?.message||e).slice(0,300);}
 finally{busy=false;$('scCancelSubmitV2').disabled=false;$('scCancelPasswordV2').value='';}
};
// Existing Sales Order view is created on demand; attach cancellation action when it becomes available.
const observer=new MutationObserver(()=>{if($('bpSoViewModalV1030')&&!$('scCancelViewBtnV2'))ensure();});
observer.observe(document.documentElement,{childList:true,subtree:true});
ensure();
})();
