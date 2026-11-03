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
  // Finance PDF precision: calculate using raw numeric measurements. Round only at display time.
  const financeArea=x=>x==null?'Unavailable':n(x).toLocaleString('en-US',{minimumFractionDigits:6,maximumFractionDigits:6})+' m²';
  const financeMoney=x=>x==null?'Unavailable':'LKR '+n(x).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
  const financeRolls=x=>x==null?'Unavailable':n(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' Rolls';
  const financeCss=`
    .finance-pdf-page-v61{width:794px;height:1123px;padding:42px 48px 43px;box-sizing:border-box;background:#fff;color:#172b35;font:13px Arial,sans-serif;overflow:hidden;position:relative}
    .finance-pdf-head-v61{border-bottom:3px solid #099397;padding-bottom:12px;margin-bottom:18px}
    .finance-pdf-head-v61 h1{font-size:25px;color:#078b90;margin:0 0 4px}
    .finance-pdf-head-v61 h2{font-size:16px;margin:0;color:#163847}
    .finance-pdf-foot-v61{position:absolute;bottom:29px;left:48px;right:48px;display:flex;justify-content:space-between;border-top:1px solid #cad9dd;padding-top:7px;color:#657983;font-size:10px}
    .finance-pdf-grid-v61{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:15px 0}
    .finance-pdf-tile-v61{border:1px solid var(--c);border-left:5px solid var(--c);border-radius:8px;padding:13px;background:var(--bg);min-height:86px;box-sizing:border-box}
    .finance-pdf-tile-v61 .lbl{font-size:10px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:var(--c)}
    .finance-pdf-tile-v61 .val{font-size:19px;font-weight:800;color:#163847;margin-top:8px;overflow-wrap:anywhere}
    .finance-pdf-tile-v61 .desc{font-size:10px;margin-top:6px;color:#526875}
    .finance-pdf-section-v61{font-size:15px;font-weight:800;color:#0c6879;margin:18px 0 9px}
    .finance-pdf-table-v61{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
    .finance-pdf-table-v61 td,.finance-pdf-table-v61 th{padding:10px 11px;text-align:left;border-bottom:1px solid #dbe5e9;vertical-align:top;overflow-wrap:anywhere}
    .finance-pdf-table-v61 td:first-child{width:45%;font-weight:700;color:#345260}
    .finance-pdf-table-v61 tr.area td{background:#e7f5ff;color:#075985;font-weight:800}
    .finance-pdf-table-v61 tr.focus td{background:#e6f8f2;color:#075943;font-weight:800}
    .finance-pdf-table-v61 tr.warning td{background:#fff1df;color:#9a3412;font-weight:800}
    .finance-pdf-note-v61{background:#fff8e9;border-left:4px solid #d97706;padding:12px 13px;line-height:1.6;font-size:11px;margin:18px 0}
    .finance-pdf-muted-v61{color:#586d77;font-size:11px;line-height:1.6}
  `;
  function financePdfPages(g,r,jbrInfo){
    const linked=jbrInfo.rows||[];
    const cut=linked.reduce((s,j)=>s+n(j.actual_cut_rolls),0);
    // mm × m / 1000 = m². Never round individual JBRs before summing.
    const area=linked.reduce((s,j)=>s+(n(j.jbr_width_mm)*n(j.jbr_length_m)/1000),0);
    const validArea=linked.length>0&&linked.every(j=>n(j.jbr_width_mm)>0&&n(j.jbr_length_m)>0&&String(j.process_status)==='Fully Die Cut');
    const rate=materialRate(r),cost=validArea&&rate!=null?area*rate:null;
    const received=n(g.receivedQty);
    const sqmPerCut=validArea&&cut>0?area/cut:null;
    const shortage=linked.length&&cut>0?Math.max(0,cut-received):null;
    const wasteSqm=sqmPerCut!=null&&shortage!=null?sqmPerCut*shortage:null;
    const wasteCost=wasteSqm!=null&&rate!=null?wasteSqm*rate:null;
    const excess=linked.length?Math.max(0,received-cut):null;
    const product=[r?.size,r?.material,r?.layout,r?.pcs?`${r.pcs} pcs/roll`:null].filter(Boolean).join(' ')||g.item||'-';
    const line=(k,v,kind='')=>`<tr class="${kind}"><td>${escText(k)}</td><td>${escText(v)}</td></tr>`;
    const table=(rows)=>`<table class="finance-pdf-table-v61"><tbody>${rows.map(x=>line(...x)).join('')}</tbody></table>`;
    const tile=(title,value,detail,kind='area')=>{
      const colors={area:['#075985','#e7f5ff'],focus:['#087055','#e6f8f2'],warning:['#a14d0b','#fff1df']};
      const [c,bg]=colors[kind];
      return `<div class="finance-pdf-tile-v61" style="--c:${c};--bg:${bg}"><div class="lbl">${escText(title)}</div><div class="val">${escText(value)}</div><div class="desc">${escText(detail)}</div></div>`;
    };
    const label=(title,no)=>`<div class="finance-pdf-head-v61"><h1>SoftCreation</h1><h2>GRN PRODUCTION COSTING · ${escText(title)}</h2><div style="font-size:12px;margin-top:7px">${escText(g.grnNo||'')} · ${escText(g.date||g.createdAt||'-')}</div></div>`;
    const footer=(no,total)=>`<div class="finance-pdf-foot-v61"><span>Finance · Material Costing · ${escText(g.grnNo||'')}</span><span>Page ${no} of ${total}</span></div>`;
    const wrap=(no,title,content)=>`<section class="finance-pdf-page-v61">${label(title,no)}${content}__FOOTER_${no}__</section>`;
    const page1=wrap(1,'Overview',`
      <div class="finance-pdf-grid-v61">
        ${tile('Measured JBR input area',financeArea(validArea?area:null),'Sum of actual linked JBR input areas')}
        ${tile('Area per cut roll',financeArea(sqmPerCut),'Measured area ÷ cut rolls')}
        ${tile('Material cost per good roll',financeMoney(cost!=null&&received>0?cost/received:null),'Total material cost ÷ Stores received','focus')}
        ${tile('Total input material cost',financeMoney(cost),'Input m² × Admin material rate','focus')}
      </div>
      <div class="finance-pdf-section-v61">Order & receipt details</div>
      ${table([
        ['Production order',g.orderNo||r?.orderNo||'-'],
        ['Dispatch number',g.dispatchNo||'-'],
        ['Customer',g.customerName||r?.customerName||'-'],
        ['Product',product],
        ['Factory dispatched',financeRolls(n(g.dispatchedQty))],
        ['Stores received',financeRolls(received),'focus'],
        ['Stores variance',financeRolls(n(g.variance))],
        ['Material rate (current)',rate==null?'Unavailable':financeMoney(rate)+' / m²']
      ])}
      <div class="finance-pdf-note-v61"><b>Precision policy:</b> Calculations use unrounded JBR lengths, widths and rates. Area is shown to 6 decimal places; monetary values to 4 decimal places. Display rounding does not affect calculated totals.</div>
    `);
    const details=linked.slice().sort((a,b)=>n(a.jbr_seq)-n(b.jbr_seq));
    const jbrLine=j=>{
      const a=n(j.jbr_width_mm)*n(j.jbr_length_m)/1000;
      return `<tr><td style="width:12%">${escText(j.jbr_seq??'-')}</td><td>${escText(n(j.jbr_width_mm).toFixed(2))}</td><td>${escText(n(j.jbr_length_m).toFixed(4))}</td><td>${escText(financeRolls(n(j.actual_cut_rolls)))}</td><td>${escText(financeArea(a))}</td></tr>`;
    };
    const chunks=[];
    for(let i=0;i<details.length;i+=9)chunks.push(details.slice(i,i+9));
    if(!chunks.length)chunks.push([]);
    const pages2=chunks.map((chunk,i)=>wrap(2+i,'Measured JBR inputs'+(i?' (continued)':''),`
      <div class="finance-pdf-section-v61">Linked JBR measurements ${chunks.length>1?'— group '+(i+1)+' of '+chunks.length:''}</div>
      <table class="finance-pdf-table-v61" style="font-size:11px"><thead><tr style="background:#e8f4f7;color:#075985"><th>JBR</th><th>Width (mm)</th><th>Length (m)</th><th>Cut rolls</th><th>Area (m²)</th></tr></thead><tbody>${chunk.length?chunk.map(jbrLine).join(''):'<tr><td colspan="5">No linked JBR measurements available</td></tr>'}</tbody></table>
      ${i===0?`<div class="finance-pdf-section-v61">Measured input reconciliation</div>
      ${table([
        ['Linked JBR records',String(details.length)],
        ['Total cut rolls',financeRolls(details.length?cut:null)],
        ['Measured JBR input area',financeArea(validArea?area:null),'area'],
        ['Single cut roll material area',financeArea(sqmPerCut),'area'],
        ['Current material rate',rate==null?'Unavailable':financeMoney(rate)+' / m²'],
        ['Measured total input material cost',financeMoney(cost),'focus'],
        ['Material cost per cut roll',financeMoney(cost!=null&&cut>0?cost/cut:null)]
      ])}`:''}
      <p class="finance-pdf-muted-v61">JBR input area = width (mm) × processed length (m) ÷ 1,000. Actual machine input width is used.</p>
    `));
    const lastNo=2+pages2.length;
    const page3=wrap(lastNo,'Waste & reconciliation',`
      <div class="finance-pdf-grid-v61">
        ${tile('Potential waste rolls',financeRolls(shortage),'Cut rolls minus Stores received','warning')}
        ${tile('Potential waste area',financeArea(wasteSqm),'Potential rolls × area per cut roll','warning')}
        ${tile('Potential waste material cost',financeMoney(wasteCost),'Potential area × material rate','warning')}
        ${tile('Good roll material cost',financeMoney(cost!=null&&received>0?cost/received:null),'Total input cost ÷ Stores received','focus')}
      </div>
      ${table([
        ['Cut rolls recorded',financeRolls(details.length?cut:null)],
        ['Stores received rolls',financeRolls(received),'focus'],
        ['Potential waste / unaccounted rolls',financeRolls(shortage),'warning'],
        ['Potential waste area',financeArea(wasteSqm),'warning'],
        ['Potential waste material cost',financeMoney(wasteCost),'warning'],
        ['Received above linked cut rolls',financeRolls(excess)],
        ['Stores variance explanation',g.factoryReason||g.storesReason||g.reason||'No variance']
      ])}
      <div class="finance-pdf-note-v61"><b>Not confirmed waste:</b> Cut-to-receipt differences may be pending stock, rework, incomplete packing or actual scrap. The potential waste cost is already included in total material cost and must never be added again.</div>
      <p class="finance-pdf-muted-v61">This PDF is a material-only estimate at the current Admin rate; the system has not frozen a historical material-rate snapshot. Labor, electricity, packing and overheads are excluded. The same JBR production batch may support multiple GRNs; do not add batch-level costing totals across multiple reports. ${escText(jbrInfo.error||'')}</p>
    `);
    const pages=[page1,...pages2,page3];
    return {css:financeCss,pages:pages.map((html,i)=>html.replace('__FOOTER_'+(i+1)+'__',footer(i+1,pages.length)))};
  }

  window.scFinanceCostingPdfV60=async function(id){
    if(!allowed())return toast('Finance access required');
    const g=grns().find(x=>String(x.id)===String(id));if(!g||!financeReady(g))return toast('GRN not ready for Finance');
    const r=jobFor(g),jbr=await loadJbrFor(r);
    const report=financePdfPages(g,r,jbr);
    const node=document.createElement('div');node.style='position:fixed;left:-12000px;top:0;z-index:-1';
    node.innerHTML='<style>'+report.css+'</style>'+report.pages.join('');document.body.append(node);
    try{
      const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
      const okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
      if(!okC||!okP)throw Error('PDF libraries unavailable');
      const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
      const pages=Array.from(node.querySelectorAll('.finance-pdf-page-v61'));
      for(let i=0;i<pages.length;i++){
        const el=pages[i];
        // Reject overly long content rather than silently slicing through a table or tile.
        if(el.scrollHeight>el.clientHeight+3)throw Error('Finance PDF page '+(i+1)+' exceeds A4 content area; please report this GRN');
        const canvas=await html2canvas(el,{scale:1.65,backgroundColor:'#fff',useCORS:true,windowWidth:900});
        if(i>0)pdf.addPage();
        // Each page is rendered separately and fitted into A4, never offset/clipped across pages.
        pdf.addImage(canvas.toDataURL('image/jpeg',0.94),'JPEG',0,0,210,297);
      }
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
