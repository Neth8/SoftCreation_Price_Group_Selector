/* SoftCreation 2026-11-11 — Ubuntu/Brave CUPS browser receipt provider.
 * CUPS mode uses window.print() and the OS print dialog, NEVER raw ESC/POS.
 * Existing dispatch save/USB logic remains owner of the workflow.
 */
(function(){
  'use strict';
  const prefKey='spgs_cups_dispatch_mode_nov11';
  const $id=id=>document.getElementById(id);
  function enabled(){try{return localStorage.getItem(prefKey)==='1'}catch(_){return false}}
  function setEnabled(on){try{localStorage.setItem(prefKey,on?'1':'0')}catch(_){}}
  function clean(v){return String(v??'').replace(/[^\x20-\x7E\n]/g,' ').replace(/[\t ]+/g,' ').trim()}
  function wrap(v,width=42){const words=clean(v).split(/\s+/).filter(Boolean);let cur='',out=[];
    for(const word of words){if(!cur)cur=word;else if((cur+' '+word).length<=width)cur+=' '+word;
      else{out.push(cur);cur=word}}if(cur)out.push(cur);return out.join('\n')+'\n'}
  function center(v,width=42){const s=clean(v).slice(0,width);return ' '.repeat(Math.max(0,Math.floor((width-s.length)/2)))+s+'\n'}
  function kv(k,v){return clean(k)+': '+clean(v)+'\n'}
  function numeric(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:3}):'0'}
  function receipt(r,d,label){
    let s='==========================================\n'+center('SOFTCREATION')+center('DISPATCH RECEIPT')+center(label)+'==========================================\n';
    s+=kv('Dispatch',d?.dispatchNo||'-');
    s+='Production:\n'+wrap((d?.sharedBatchJobs||[]).map(j=>j.orderNo).filter(Boolean).join(', ')||r?.orderNo||d?.orderNo||'-');
    s+=kv('Date',d?.date||'-')+kv('PI',r?.piSerial||d?.piSerial||'-');
    s+='------------------------------------------\nCUSTOMER\n';
    const customers=(d?.sharedBatchJobs||[]).map(j=>j.customerName).filter(Boolean);
    s+=wrap([...new Set(customers)].join(', ')||r?.customerName||d?.customerName||'-');
    s+='ITEM\n'+wrap([r?.size,r?.material,r?.layout,Number(r?.pcs||0)>0?`${r.pcs} pcs/roll`:null].filter(Boolean).join(' '));
    s+='------------------------------------------\n';
    if(d?.directToCustomer){const x=d.directDelivery||{};s+='DESTINATION - CUSTOMER\n'+wrap(x.customerName||d?.customerName||'-');
      if(x.customerPhone)s+=kv('Phone',x.customerPhone);if(x.address)s+='Address:\n'+wrap(x.address);
      if(x.vehicleNo)s+=kv('Vehicle',x.vehicleNo);if(x.driverName)s+=kv('Driver',x.driverName);
    }else s+='DESTINATION - STORES\n'+kv('Carrier',d?.carrier||'-');
    s+='------------------------------------------\nPACKING / LOADING\n';
    const boxes=Array.isArray(d?.sharedBatchBoxes)?d.sharedBatchBoxes:Array.isArray(d?.boxes)?d.boxes:[];
    boxes.forEach((b,i)=>s+=kv('Box '+clean(b?.boxNo||String(i+1).padStart(2,'0')),numeric(b?.qty||0)+' rolls'));
    const loose=Number(d?.sharedBatchLoose??d?.loose??0);if(loose>0)s+=kv('Loose',numeric(loose)+' rolls');
    s+='------------------------------------------\n'+kv('TOTAL',numeric(d?.sharedBatchTotal??d?.qty??0)+' rolls');
    if(d?.note)s+='NOTE\n'+wrap(d.note);
    s+='\nCreated By: '+clean(d?.by||d?.byUser||'-')+'\n\nFactory Person Signature\n______________________________\n\nDelivery Person Signature\n______________________________\n\n';
    return s;
  }
  function launch(documents){
    // Must be called from an actual user gesture: successful dispatch click or manual print button.
    const win=window.open('','_blank','width=520,height=720');
    if(!win)throw new Error('Brave blocked the print popup. Allow popups for this website.');
    win.document.open();
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>SoftCreation Dispatch Receipt</title><style>@page{size:80mm 297mm;margin:0}html,body{padding:0;margin:0;background:white;color:black}main{padding:3mm 4mm}pre{font:10px/1.22 monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;max-width:72mm}.receipt+ .receipt{break-before:page;page-break-before:always}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact}}</style></head><body><div class="no-print" style="padding:12px;background:#edf7f9;font:13px sans-serif">Select the installed Gprinter in Brave Print. If no printer is listed, configure it under Ubuntu Settings → Printers. Use 80 mm paper, margins None, scale 100%. Printing is NOT confirmed until the OS printer completes it. <button onclick="window.print()">Print again</button></div><main id="receipt-main"></main></body></html>');
    const host=win.document.getElementById('receipt-main');
    documents.forEach(text=>{const page=win.document.createElement('section');page.className='receipt';const pre=win.document.createElement('pre');pre.textContent=text;page.appendChild(pre);host.appendChild(page)});
    win.document.close();win.focus();
    // Opening a dialog is not proof that the printer completed the job.
    win.print();
    return {label:'Ubuntu/CUPS',dialogOpened:true};
  }
  const existing=window.printDispatchReceiptV1127;
  window.printDispatchReceiptV1127=function(r,d){
    if(enabled())return Promise.resolve(launch([receipt(r,d,'FACTORY COPY'),receipt(r,d,'DELIVERY COPY')]));
    if(typeof existing==='function')return existing(r,d);
    if(typeof window.getConnectedUsbPrinterV1126==='function'&&window.getConnectedUsbPrinterV1126()&&typeof window.printDispatchReceiptUsbV1126==='function')
      return window.printDispatchReceiptUsbV1126(r,d).then(()=>({label:'USB receipt'}));
    return Promise.reject(new Error('No receipt printer selected. Enable Ubuntu CUPS mode in Printers, or connect a WebUSB printer.'));
  };
  function recent(){const items=[];const seen=new Set();try{for(const r of state?.productionRequests||[])for(const d of r.dispatches||[]){const key=String(d.sharedBatchDispatchId||d.dispatchNo||d.id);if(!key||seen.has(key))continue;seen.add(key);items.push({r,d})}}catch(_){}
    return items.sort((a,b)=>String(b.d?.at||b.d?.date||'').localeCompare(String(a.d?.at||a.d?.date||''))).slice(0,35)}
  window.spgsCupsEnableNov11=function(v){setEnabled(!!v);const note=$id('spgsCupsModeNoteNov11');if(note)note.textContent=enabled()?'Ubuntu CUPS enabled. Printing opens a Brave dialog after a new successful dispatch.':'Ubuntu CUPS disabled. Existing WebUSB behavior is retained.'};
  window.spgsCupsTestNov11=function(){try{launch([center('SOFTCREATION')+'UBUNTU / CUPS TEST\n'+new Date().toLocaleString()+'\n\nIf this prints, CUPS output is working.\n'])}catch(e){alert(e.message)}};
  window.spgsCupsRefreshNov11=function(){const sel=$id('spgsCupsRecentNov11');if(!sel)return;const items=recent();sel.innerHTML='';items.forEach((x,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${x.d.dispatchNo||'-'} · ${x.r.orderNo||'-'} · ${numeric(x.d.sharedBatchTotal??x.d.qty)} rolls`;sel.appendChild(o)});sel.disabled=!items.length;sel.dataset.count=String(items.length);if(!items.length){const o=document.createElement('option');o.textContent='No recent dispatches';sel.appendChild(o)}};
  window.spgsCupsReprintNov11=function(){const items=recent(),i=Number($id('spgsCupsRecentNov11')?.value||0),x=items[i];if(!x)return alert('Choose a dispatch receipt');try{launch([receipt(x.r,x.d,'FACTORY COPY - REPRINT'),receipt(x.r,x.d,'DELIVERY COPY - REPRINT')])}catch(e){alert(e.message)}};
  function install(){const parent=$id('printerTabUsbV1124');if(!parent||$id('spgsCupsPanelNov11'))return;
    const el=document.createElement('section');el.id='spgsCupsPanelNov11';
    el.innerHTML='<h3 style="margin:0 0 6px">Ubuntu / Brave — CUPS Receipt Printing</h3><div class="spgs-cups-note">Alternative to WebUSB: uses Brave’s normal printer dialog and your installed Ubuntu/CUPS printer. This cannot silently send ESC/POS commands or confirm paper output.</div><label style="display:flex;align-items:center;gap:9px;margin-top:12px"><input type="checkbox" id="spgsCupsModeNov11" style="width:18px;height:18px"> Use Ubuntu CUPS for future dispatch receipts</label><div id="spgsCupsModeNoteNov11" class="spgs-cups-note"></div><div class="spgs-cups-actions"><button type="button" class="btn ghost sm" onclick="spgsCupsTestNov11()">Test Ubuntu Print</button><button type="button" class="btn ghost sm" onclick="spgsCupsRefreshNov11()">Refresh Recent Receipts</button></div><div class="spgs-cups-actions"><select id="spgsCupsRecentNov11" aria-label="Recent dispatch receipt"></select><button type="button" class="btn primary sm" onclick="spgsCupsReprintNov11()">Print Selected Receipt (2 copies)</button></div>';
    parent.appendChild(el);const box=$id('spgsCupsModeNov11');box.checked=enabled();box.addEventListener('change',e=>window.spgsCupsEnableNov11(e.target.checked));window.spgsCupsEnableNov11(box.checked);window.spgsCupsRefreshNov11();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
