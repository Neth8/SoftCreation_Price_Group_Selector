/* SoftCreation Ubuntu/Brave browser-printing fallback.
   Uses the browser's native print dialog (CUPS) and does not bypass WebUSB or OS permissions.
   No Supabase writes; no automatic duplicate print jobs. */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = v => String(v ?? '').trim() || '-';
  const num = v => { const n=Number(v); return Number.isFinite(n) ? n : 0; };
  const where = () => document.getElementById('printerTabUsbV1124');
  const stamp = v => { const d=new Date(v||Date.now()); return Number.isFinite(d.valueOf())?d.toLocaleString():text(v); };
  function receiptHtml(r, d, copy) {
    const p = d?.directToCustomer ? d?.directDelivery || {} : null;
    const boxes=Array.isArray(d?.boxes) ? d.boxes : [];
    const line=(label,value)=>`<div class="kv"><span>${esc(label)}</span><b>${esc(text(value))}</b></div>`;
    return `<section class="receipt">
      <header><h2>SOFTCREATION</h2><b>DISPATCH RECEIPT</b><p>${esc(copy)}</p></header>
      ${line('Dispatch',d?.dispatchNo)}${line('Production',r?.orderNo || d?.orderNo)}
      ${line('PI',r?.piSerial || d?.piSerial)}${line('Date',d?.date || stamp(d?.at))}
      <h3>CUSTOMER</h3><p>${esc(text(r?.customerName || d?.customerName))}</p>
      <h3>ITEM</h3><p>${esc([r?.size,r?.material,r?.layout,num(r?.pcs)>0?`${num(r.pcs)} pcs/roll`:null].filter(Boolean).join(' '))}</p>
      <h3>DESTINATION</h3><p>${esc(p ? text(p.customerName||d?.customerName) : 'STORES')}</p>
      ${p ? `${p.customerPhone?line('Phone',p.customerPhone):''}${p.address?`<p>${esc(p.address)}</p>`:''}${p.driverName?line('Driver',p.driverName):''}${p.vehicleNo?line('Vehicle',p.vehicleNo):''}` : line('Carrier',d?.carrier)}
      <h3>PACKING / LOADING</h3>
      ${boxes.map((b,i)=>line(`Box ${b?.boxNo||i+1}`,`${num(b?.qty)} rolls`)).join('')}
      ${num(d?.loose)>0?line('Loose',`${num(d.loose)} rolls`):''}
      <div class="total">${line('TOTAL',`${num(d?.qty)} rolls`)}</div>
      ${d?.note?`<h3>NOTE</h3><p>${esc(d.note)}</p>`:''}
      ${line('Created By',d?.by || d?.byUser)}
      <div class="sign">Factory Person Signature<br/>________________________________<br/><br/>Delivery Person Signature<br/>________________________________</div>
      <footer>DISPATCH LOCKED</footer></section>`;
  }
  function documentHtml(content,title) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page {size:80mm auto;margin:3mm} *{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font:11px/1.35 Arial,sans-serif}h2,h3,p{margin:0}h2{font-size:16px}h3{font-size:11px;border-bottom:1px dashed #555;padding:4px 0;margin:6px 0 3px}header{text-align:center;margin-bottom:8px}header p{font-size:12px;font-weight:700;margin-top:4px}.receipt{width:74mm;max-width:100%;padding:1mm 1mm 4mm;margin:0 auto 10mm;break-after:page;page-break-after:always}.receipt:last-child{break-after:auto;page-break-after:auto}.kv{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.kv span{flex:0 0 38%}.kv b{flex:1;text-align:right;overflow-wrap:anywhere}.total{font-size:13px;font-weight:700;border-top:1px solid #000;border-bottom:1px solid #000;margin:7px 0}.sign{margin-top:12px;line-height:1.7}footer{text-align:center;font-weight:bold;border-top:1px dashed #333;margin-top:12px;padding-top:7px}p{overflow-wrap:anywhere;white-space:pre-wrap}@media screen{body{padding:20px;background:#e5e7eb}.receipt{background:#fff;padding:12px;box-shadow:0 2px 9px #999}}
      </style></head><body>${content}<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),250)});<\/script></body></html>`;
  }
  function openPrint(html,title) {
    // Must be called directly from the user's click to avoid popup blocking.
    const w=window.open('','_blank');
    if(!w){alert('Brave blocked the print window. Allow pop-ups for this SPGS website and try again.');return false}
    w.document.open();w.document.write(documentHtml(html,title));w.document.close();return true;
  }
  function recent() {
    // Read existing in-memory production/dispatch ledger only; never write state.
    let jobs=[];
    try { jobs = Array.isArray(state?.productionRequests)?state.productionRequests:[]; } catch (_) {}
    return jobs.flatMap(r=>(Array.isArray(r?.dispatches)?r.dispatches:[]).map(d=>({r,d})))
      .filter(x=>x.d?.dispatchNo||x.d?.id)
      .sort((a,b)=>Date.parse(b.d?.at||b.d?.createdAt||b.d?.date||0)-Date.parse(a.d?.at||a.d?.createdAt||a.d?.date||0))
      .slice(0,30);
  }
  window.scUbuntuCupsTestPrint=function() {
    const html=`<section class="receipt"><header><h2>SOFTCREATION</h2><b>UBUNTU / CUPS PRINT TEST</b></header><h3>BRAVE BROWSER PRINTING</h3><p>${esc(stamp())}</p><p>Use the Ubuntu print dialog to select the installed Gprinter.</p><p>Browser printing does not use WebUSB.</p><footer>TEST COMPLETE</footer></section>`;
    openPrint(html,'SoftCreation Ubuntu printer test');
  };
  window.scUbuntuPrintDispatch=function(index){
    const x=recent()[Number(index)];
    if(!x)return alert('Dispatch not available. Refresh the dispatch list.');
    openPrint(receiptHtml(x.r,x.d,'FACTORY COPY')+receiptHtml(x.r,x.d,'DELIVERY COPY'),`Dispatch ${text(x.d.dispatchNo)}`);
  };
  window.scUbuntuRefreshDispatchList=function(){
    const host=document.getElementById('scUbuntuDispatchList');if(!host)return;
    const items=recent();
    host.innerHTML=items.length?items.map((x,i)=>`<div class="sc-cups-row"><div><b>${esc(text(x.d.dispatchNo||x.d.id))}</b><small>${esc(text(x.r?.orderNo))} · ${esc(text(x.r?.customerName))} · ${esc(String(num(x.d?.qty)))} rolls</small></div><button class="btn ghost sm" type="button" onclick="scUbuntuPrintDispatch(${i})">Print 2 Copies</button></div>`).join(''):'<div class="small">No dispatch receipts are currently loaded. Open Products/Dispatch and refresh, then return here.</div>';
  };
  function mount(){
    const parent=where();if(!parent||document.getElementById('scUbuntuCupsPanel'))return;
    const style=document.createElement('style');style.textContent=`#scUbuntuCupsPanel{margin:16px 0;padding:15px;border:1px solid #9cc8c6;border-radius:14px;background:rgba(0,153,153,.055)}#scUbuntuCupsPanel .sc-cups-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #d6e4e5}#scUbuntuCupsPanel small{display:block;opacity:.75;margin-top:3px}#scUbuntuCupsPanel .actions{display:flex;gap:8px;flex-wrap:wrap}#scUbuntuCupsPanel p{margin:7px 0}#scUbuntuDispatchList{max-height:280px;overflow:auto}`;document.head.appendChild(style);
    parent.insertAdjacentHTML('beforeend',`<section id="scUbuntuCupsPanel"><h3>Ubuntu / Brave — CUPS Printing</h3><p>When WebUSB says <b>Access denied</b>, use the installed Ubuntu printer through Brave's regular print dialog. No USB permission or driver takeover is needed.</p><div class="actions"><button class="btn primary sm" type="button" onclick="scUbuntuCupsTestPrint()">Test Ubuntu Print</button><button class="btn ghost sm" type="button" onclick="scUbuntuRefreshDispatchList()">Refresh Dispatch Receipts</button></div><p class="small">Select the Gprinter in Brave's dialog and configure its paper size (typically 80 mm). Factory and delivery copies are printed as separate sections. This method does not send raw ESC/POS cut commands; automatic unattended printing still requires the existing printer gateway or functioning WebUSB.</p><h4 style="margin:14px 0 6px">Recent dispatch receipts</h4><div id="scUbuntuDispatchList"></div></section>`);
    window.scUbuntuRefreshDispatchList();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  const oldOpen=window.openPrinterHubV1124;
  if(typeof oldOpen==='function')window.openPrinterHubV1124=function(){const result=oldOpen.apply(this,arguments);mount();window.scUbuntuRefreshDispatchList();return result};
})();
