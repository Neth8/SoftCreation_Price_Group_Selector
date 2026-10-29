
/* SPGS live dispatch status chips v3 — derived from the verified dispatch ledger. */
(function(){
  const labels={'Fully Sent':'Fully Sent','Partially Sent':'Partially Sent','New':'New Order','Unknown':'Status Unavailable'};
  const classes={'Fully Sent':'fully','Partially Sent':'partial','New':'new','Unknown':'unknown'};
  const POLL_MS=12000;
  let lastRead=0, pending=null, ready=false, lastError='', cache=Object.create(null), progress=Object.create(null);
  const isOpen=()=>!!document.querySelector('#salesorders.active');
  function statusFor(so){return ready?(cache[String(so?.id||'')]||'Unknown'):'Unknown';}
  function renderChips(){
    const host=document.querySelector('#soList91');if(!host)return;
    const byNumber=new Map((state.salesOrders||[]).map(x=>[String(x.soNo||''),x]));
    host.querySelectorAll('table tbody tr').forEach(row=>{
      const first=row.querySelector('td:first-child');
      const serial=first?.querySelector('b')?.textContent?.trim();
      const so=byNumber.get(serial);if(!so||!first)return;
      const status=statusFor(so),type=classes[status]||'unknown';
      let wrap=first.querySelector('.spgs-live-chip-slot');
      if(!wrap){wrap=document.createElement('span');wrap.className='spgs-live-chip-slot';first.appendChild(wrap);}
      let chip=wrap.querySelector('.spgs-live-chip');
      if(!chip){chip=document.createElement('span');wrap.appendChild(chip);}
      chip.className='spgs-live-chip is-'+type;
      chip.textContent=labels[status]||labels.Unknown;
      const p=progress[String(so.id)];
      if(status==='Unknown')chip.title=lastError||'Verified dispatch totals unavailable';
      else if(p){
        const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
        const heading=status==='Fully Sent'?'Order fully dispatched':status==='Partially Sent'?'Order partially dispatched':'No physical dispatch recorded';
        chip.title=heading+'\nSent: '+fmt(p.sent)+' of '+fmt(p.ordered)+'\nRemaining: '+fmt(p.remaining)+
          (p.lastDispatchAt?'\nLast dispatch: '+new Date(p.lastDispatchAt).toLocaleString():'\nDispatch date/time: Not available from dispatch totals')+
          '\nVerified: '+new Date(lastRead).toLocaleString();
      }else chip.title='Physical dispatch data verified';
      chip.setAttribute('aria-label','Physical dispatch: '+(labels[status]||labels.Unknown));
      row.classList.remove('spgs-so-fully','spgs-so-partial','spgs-so-new','spgs-so-unknown');
      row.classList.add('spgs-so-'+type);
    });
  }
  async function refresh(force=false){
    if(!isOpen()||typeof window.spgsGetSalesOrderStatusesV2!=='function')return;
    if(pending)return pending;
    if(!force&&Date.now()-lastRead<POLL_MS){renderChips();return;}
    pending=(async()=>{
      try{
        const detailed=typeof window.spgsGetSalesOrderProgressV3==='function';
        const next=detailed?await window.spgsGetSalesOrderProgressV3():await window.spgsGetSalesOrderStatusesV2();
        if(!next||typeof next!=='object')throw new Error('Invalid dispatch status response');
        progress=detailed?next:Object.create(null);
        cache=detailed?Object.fromEntries(Object.entries(next).map(([id,p])=>[id,p.status])):next;
        ready=true;lastError='';lastRead=Date.now();
      }catch(e){
        // Never show a stale Fully Sent badge when the verification service fails.
        ready=false;progress=Object.create(null);lastError='Live status check failed: '+String(e?.message||e);
        lastRead=Date.now();console.warn('SPGS live status refresh',e);
      }finally{pending=null;renderChips();}
    })();
    return pending;
  }
  function install(){
    if(window.__spgsSoStatusInstalledV3||typeof window.renderSalesOrders91!=='function')return;
    window.__spgsSoStatusInstalledV3=true;
    const original=window.renderSalesOrders91;
    window.renderSalesOrders91=function(){const r=original.apply(this,arguments);renderChips();void refresh();return r;};
    try{renderSalesOrders91=window.renderSalesOrders91;}catch(_){ }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
    document.querySelector('[data-view="salesorders"]')?.addEventListener('click',()=>{setTimeout(()=>refresh(true),100);});
    document.querySelector('#appRefreshBtnV1079')?.addEventListener('click',()=>{setTimeout(()=>refresh(true),300);});
    // Poll only while the Sales Orders tab is visible. No database mutation occurs.
    setInterval(()=>{if(!document.hidden&&isOpen())void refresh();},POLL_MS);
    if(isOpen())void refresh(true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
