/* SPGS Finance GRN register: presentation-only migration of existing saved GRNs.
   No GRN, JBR, dispatch, costing or audit history is deleted or changed. */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const escText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=x=>Number.isFinite(Number(x))?Number(x):0;
  const fmt=x=>n(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const allowed=()=>typeof currentUser!=='undefined'&&!!currentUser&&(currentUser.role==='admin'||hasPerm('finance_view')||hasPerm('finance_grn'));
  let page=1;
  const pageSize=12;
  const financeReady=g=>!!g&&(!n(g.variance)||!!String(g.factoryReason||'').trim());
  const grns=()=>typeof state!=='undefined'&&Array.isArray(state.grns)?state.grns:[];
  const jobs=()=>typeof state!=='undefined'&&Array.isArray(state.productionRequests)?state.productionRequests:[];
  const jobFor=g=>jobs().find(r=>String(r.id)===String(g.requestId));
  const materialRate=r=> {
    const rates=typeof state!=='undefined'?state.settings?.pricing?.materialRates:{};
    const x=rates?.[r?.material||''];return Number.isFinite(Number(x))?Number(x):null;
  };
  const safeId=id=>JSON.stringify(String(id));
  function financeRows(){
    return grns().filter(financeReady).map(g=>({g,r:jobFor(g)})).sort((a,b)=>String(b.g.createdAt||b.g.date||'').localeCompare(String(a.g.createdAt||a.g.date||'')));
  }
  function paintFinance(){
    const host=byId('scFinanceRowsV60');if(!host)return;
    if(!allowed()){host.innerHTML='<div class="empty">Finance access is required.</div>';return}
    const search=(byId('scFinanceSearchV60')?.value||'').toLowerCase().trim();
    let rows=financeRows();
    const allCount=rows.length;
    rows=rows.filter(({g,r})=>!search||[g.grnNo,g.dispatchNo,g.orderNo,g.customerName,g.item,r?.size,r?.material].join(' ').toLowerCase().includes(search));
    const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(Math.max(1,page),totalPages);
    const slice=rows.slice((page-1)*pageSize,page*pageSize);
    byId('scFinanceCountersV60').innerHTML=`<div><small>Received GRNs in Finance</small><strong>${allCount}</strong></div><div><small>Matching records</small><strong>${rows.length}</strong></div><div><small>Rolls received (filtered)</small><strong>${fmt(rows.reduce((s,x)=>s+n(x.g.receivedQty),0))}</strong></div><div><small>Unresolved variance</small><strong>${grns().filter(g=>!financeReady(g)).length}</strong></div>`;
    host.innerHTML=rows.length?`<div class="tablewrap"><table class="table"><thead><tr><th>GRN / Date</th><th>Production / Dispatch</th><th>Product / Customer</th><th>Received / Variance</th><th>Material rate</th><th>Report</th></tr></thead><tbody>${slice.map(({g,r})=>`<tr>
      <td><b>${escText(g.grnNo)}</b><div class="small">${escText(g.date||g.createdAt||'')}</div></td>
      <td>${escText(g.orderNo||r?.orderNo||'-')}<div class="small">${escText(g.dispatchNo||'-')}</div></td>
      <td><b>${escText(g.customerName||r?.customerName||'-')}</b><div class="small">${escText([r?.size,r?.material,r?.layout].filter(Boolean).join(' ')||g.item||'-')}</div></td>
      <td><b>${fmt(g.receivedQty)} ${escText(g.unit||'Rolls')}</b><div class="small">Variance: ${fmt(g.variance)} · ${escText(g.varianceStatus||'Confirmed')}</div></td>
      <td>${materialRate(r)==null?'<span class="small">Not configured</span>':'LKR '+fmt(materialRate(r))+' / m²'}</td>
      <td><button type="button" class="btn green sm" data-grn-pdf="${escText(g.id)}">Costing PDF</button></td>
    </tr>`).join('')}</tbody></table></div>`:'<div class="empty">No confirmed GRNs matching the filter. Complete Stores Receive / Count first.</div>';
    byId('scFinancePagerV60').innerHTML=`<span>${rows.length?((page-1)*pageSize+1):0}–${Math.min(page*pageSize,rows.length)} of ${rows.length}</span><button type="button" class="btn ghost sm" data-finance-page="prev" ${page===1?'disabled':''}>Previous</button><span>Page ${page} / ${totalPages}</span><button type="button" class="btn ghost sm" data-finance-page="next" ${page>=totalPages?'disabled':''}>Next</button>`;
    const stamp=byId('scFinanceStampV60');if(stamp)stamp.textContent='Last updated '+new Date().toLocaleTimeString();
  }
  async function loadJbrFor(r){
    if(!r?.id)return {rows:[],error:'Production job unavailable'};
    const productKey=typeof productionProductKeyV103==='function'?productionProductKeyV103(r):[r.size,r.material,r.layout,r.pcs,r.unit].join('|').toUpperCase();
    const key=localStorage.getItem('spgs_supabase_browser_key_v1');
    if(!key)return {rows:[],error:'Supabase browser key unavailable'};
    const url='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1/spgs_product_jbrs?workspace=eq.softcreation_main&product_key=eq.'+encodeURIComponent(productKey)+'&select=id,jbr_seq,jbr_width_mm,jbr_length_m,actual_cut_rolls,pcs_per_roll,source_job_ids,process_status';
    try{
      const headers={apikey:key};if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
      const res=await fetch(url,{headers});if(!res.ok)throw Error('JBR data '+res.status);
      const data=await res.json();
      return {rows:(Array.isArray(data)?data:[]).filter(j=>Array.isArray(j.source_job_ids)&&j.source_job_ids.includes(r.id)),error:null};
    }catch(e){return {rows:[],error:e.message||'JBR data unavailable'}}
  }
  function htmlReport(g,r,jbrInfo){
    const cut=jbrInfo.rows.reduce((s,j)=>s+n(j.actual_cut_rolls),0);
    const area=jbrInfo.rows.reduce((s,j)=>s+(n(j.jbr_width_mm)*n(j.jbr_length_m)/1000),0);
    const validArea=jbrInfo.rows.length>0&&jbrInfo.rows.every(j=>n(j.jbr_width_mm)>0&&n(j.jbr_length_m)>0&&String(j.process_status)==='Fully Die Cut');
    const rate=materialRate(r),cost=validArea&&rate!=null?area*rate:null;
    const good=n(g.receivedQty), perGood=cost!=null&&good>0?cost/good:null;
    const mismatch=cut>0?cut-good:null;
    const amount=x=>x==null?'Not available':'LKR '+fmt(x);
    const field=(label,value)=>`<tr><td style="padding:9px;border-bottom:1px solid #dde5e7;font-weight:600;width:48%">${escText(label)}</td><td style="padding:9px;border-bottom:1px solid #dde5e7">${escText(value)}</td></tr>`;
    const reportRows=[
      ['GRN Number',g.grnNo],['Receipt date',g.date||g.createdAt||'-'],['Production order',g.orderNo||r?.orderNo||'-'],['Dispatch number',g.dispatchNo||'-'],['Customer',g.customerName||r?.customerName||'-'],
      ['Product',[r?.size,r?.material,r?.layout,r?.pcs?`${r.pcs} pcs/roll`:null].filter(Boolean).join(' ')||g.item||'-'],['Factory dispatched',fmt(g.dispatchedQty)+' Rolls'],['Stores received',fmt(g.receivedQty)+' Rolls'],['Stores variance',fmt(g.variance)+' Rolls'],['Variance explanation',g.factoryReason||g.storesReason||g.reason||'No variance'],
      ['Linked JBR records',jbrInfo.rows.length],['JBR cut rolls (linked)',jbrInfo.rows.length?fmt(cut):'Unavailable'],['Measured JBR input area',validArea?fmt(area)+' m²':'Unavailable'],['Current material rate',rate==null?'Unavailable':'LKR '+fmt(rate)+' / m²'],
      ['Indicative material cost',amount(cost)],['Indicative material cost per received roll',amount(perGood)],['JBR cut minus received rolls',mismatch==null?'Unavailable':fmt(mismatch)+' Rolls — investigate, not automatically waste']
    ];
    return `<div style="font:14px Arial,sans-serif;color:#172b35;padding:30px;width:760px;box-sizing:border-box;background:#fff"><div style="border-bottom:4px solid #098e91;padding-bottom:15px"><h1 style="color:#098e91;margin:0">SoftCreation</h1><h2 style="margin:10px 0 4px">STORES GRN · PRODUCTION COSTING</h2><div>${escText(g.grnNo||'')}</div></div><table style="width:100%;border-collapse:collapse;margin-top:20px">${reportRows.map(x=>field(...x)).join('')}</table><p style="font-size:12px;line-height:1.6;color:#556a75;margin-top:24px">Material-only estimate based on linked fully die-cut JBR widths and lengths and the <b>current</b> Admin material rate. This is not a historical rate snapshot and excludes labor, overheads, packaging and other costs. A shortfall is not automatically waste; account for damage, reuse and outstanding stock separately. ${escText(jbrInfo.error||'')}</p><p style="font-size:12px">Generated ${new Date().toLocaleString()} · Finance copy</p></div>`;
  }
  window.scFinanceCostingPdfV60=async function(id){
    if(!allowed())return toast('Finance access required');
    const g=grns().find(x=>String(x.id)===String(id));if(!g||!financeReady(g))return toast('GRN not ready for Finance');
    const r=jobFor(g),jbr=await loadJbrFor(r);
    const node=document.createElement('div');node.style='position:fixed;left:-12000px;top:0;z-index:-1';node.innerHTML=htmlReport(g,r,jbr);document.body.append(node);
    try{
      const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
      const okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
      if(!okC||!okP)throw Error('PDF libraries unavailable');
      const canvas=await html2canvas(node.firstElementChild,{scale:1.8,backgroundColor:'#fff'});
      const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
      const iw=190,ih=canvas.height*iw/canvas.width,img=canvas.toDataURL('image/jpeg',0.93);
      let y=10;pdf.addImage(img,'JPEG',10,y,iw,ih);while(ih+y>287){y-=277;pdf.addPage();pdf.addImage(img,'JPEG',10,y,iw,ih)}
      pdf.save('Finance_'+String(g.grnNo||g.id).replace(/[^a-z0-9_-]/gi,'-')+'.pdf');
    }catch(e){console.error('Finance PDF',e);toast('Finance PDF error: '+(e.message||e))}finally{node.remove()}
  };
  function replaceStoresButtons(){
    const host=byId('storesQueue');if(!host)return;
    host.querySelectorAll('button[onclick*="downloadGRNV8"]').forEach(button=>{
      const row=button.closest('tr');
      const text=row?.textContent||'';
      const g=grns().find(x=>text.includes(x.grnNo));
      if(!g)return;
      const badge=document.createElement('span');badge.className='tag';
      badge.style='background:#dcf8ec;color:#08734c;font-weight:800;display:inline-block;padding:9px 11px';
      badge.textContent='✓ Transferred to Finance';
      badge.title='GRN is available in Finance. Costing PDF is downloaded from the Finance tab.';
      button.replaceWith(badge);
    });
  }
  function setup(){
    const finance=byId('finance');if(!finance)return;
    finance.innerHTML=`<div class="panel"><div class="panel-title"><span>Finance · GRN Costing Reports</span><button type="button" class="btn sm" style="background:white;color:#087e82" onclick="renderFinanceV1059(true)">Refresh</button></div><div class="panel-body"><div class="notice">Each completed Stores / GRN receipt appears here automatically. Generate a separate costing PDF for each GRN. Records awaiting a factory variance explanation stay pending in Stores.</div><div id="scFinanceCountersV60" class="sc-finance-summary-v60"></div><input class="search" id="scFinanceSearchV60" placeholder="Search GRN, production order, customer or item" aria-label="Search Finance GRNs" style="max-width:610px;width:100%;margin:14px 0"/><div id="scFinanceStampV60" class="small" style="margin-bottom:9px"></div><div id="scFinanceRowsV60"></div><div id="scFinancePagerV60" class="sc-finance-pager-v60"></div></div></div>`;
    const input=byId('scFinanceSearchV60');input?.addEventListener('input',()=>{page=1;paintFinance()});
    finance.addEventListener('click',evt=>{
      const pdf=evt.target.closest('[data-grn-pdf]');if(pdf){scFinanceCostingPdfV60(pdf.dataset.grnPdf);return}
      const pageButton=evt.target.closest('[data-finance-page]');if(pageButton){page+=pageButton.dataset.financePage==='next'?1:-1;paintFinance()}
    });
    window.renderFinanceV1059=function(){paintFinance();return Promise.resolve()};
    try{renderFinanceV1059=window.renderFinanceV1059}catch(_){}
    if(typeof window.renderStoresQueueV8==='function'){
      const previous=window.renderStoresQueueV8;
      window.renderStoresQueueV8=function(){const ret=previous.apply(this,arguments);replaceStoresButtons();return ret};
      try{renderStoresQueueV8=window.renderStoresQueueV8}catch(_){}
    }
    try{renderStoresQueueV8()}catch(_){}
    if(finance.classList.contains('active'))paintFinance();
    setInterval(()=>{if(finance.classList.contains('active')&&!document.hidden)paintFinance()},12000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
