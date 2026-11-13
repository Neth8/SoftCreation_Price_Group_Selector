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
      <td>
        <div style="display:inline-flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn primary sm" data-grn-view-pdf="${escText(g.id)}">View PDF</button>
          <button type="button" class="btn green sm" data-grn-pdf="${escText(g.id)}">Costing PDF</button>
        </div>
      </td>
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
    const good=n(g.receivedQty);
    // Difference is NOT confirmed scrap: material may remain unpacked, be reusable, or be awaiting QC.
    // Roll-equivalent m² uses measured input area / actual cut rolls, not the original requested quantity.
    const sqmPerCut=validArea&&cut>0?area/cut:null;
    const potentialWasteRolls=jbrInfo.rows.length&&cut>0?Math.max(0,cut-good):null;
    const potentialWasteSqm=sqmPerCut!=null&&potentialWasteRolls!=null?sqmPerCut*potentialWasteRolls:null;
    const potentialWasteCost=potentialWasteSqm!=null&&rate!=null?potentialWasteSqm*rate:null;
    const cutRollCost=cost!=null&&cut>0?cost/cut:null;
    const perGood=cost!=null&&good>0?cost/good:null;
    const excessRolls=jbrInfo.rows.length?Math.max(0,good-cut):null;
    const amount=x=>x==null?'Unavailable':'LKR '+fmt(x);
    const sqm=x=>x==null?'Unavailable':fmt(x)+' m²';
    const rolls=x=>x==null?'Unavailable':fmt(x)+' Rolls';
    const field=(label,value,tone='')=>{
      const styles={area:['#e7f5ff','#075985','#0284c7'],focus:['#e6f8f2','#075943','#0d9488'],warning:['#fff1df','#9a3412','#f59e0b'],ordinary:['#ffffff','#172b35','#dde5e7']};
      const st=styles[tone]||styles.ordinary;
      return `<tr style="background:${st[0]}"><td style="padding:9px 11px;border-bottom:1px solid ${st[2]};font-weight:${tone?'800':'600'};width:48%;color:${st[1]}">${escText(label)}</td><td style="padding:9px 11px;border-bottom:1px solid ${st[2]};font-weight:${tone?'800':'400'};color:${st[1]}">${escText(value)}</td></tr>`;
    };
    const tile=(title,value,color,shade,detail)=>`<div style="background:${shade};border:1px solid ${color};border-top:4px solid ${color};border-radius:9px;padding:11px 13px;min-width:0;box-sizing:border-box;break-inside:avoid"><div style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:${color}">${escText(title)}</div><div style="font-size:19px;font-weight:800;color:${color};margin-top:6px">${escText(value)}</div><div style="font-size:10px;color:#526370;margin-top:5px">${escText(detail)}</div></div>`;
    const reportRows=[
      ['GRN Number',g.grnNo],['Receipt date',g.date||g.createdAt||'-'],['Production order',g.orderNo||r?.orderNo||'-'],['Dispatch number',g.dispatchNo||'-'],['Customer',g.customerName||r?.customerName||'-'],
      ['Product',[r?.size,r?.material,r?.layout,r?.pcs?`${r.pcs} pcs/roll`:null].filter(Boolean).join(' ')||g.item||'-'],
      ['Factory dispatched',rolls(n(g.dispatchedQty))],['Stores received (good)',rolls(good)],['Stores variance',rolls(n(g.variance))],['Variance explanation',g.factoryReason||g.storesReason||g.reason||'No variance'],
      ['Linked JBR records',String(jbrInfo.rows.length)],['JBR cut rolls (linked)',jbrInfo.rows.length?rolls(cut):'Unavailable'],
      ['Measured JBR input area',sqm(validArea?area:null),'area'],
      ['Single cut roll material area',sqm(sqmPerCut),'area'],
      ['Current material rate',rate==null?'Unavailable':'LKR '+fmt(rate)+' / m²'],
      ['Total measured material cost',amount(cost),'focus'],
      ['Material cost per cut roll',amount(cutRollCost)],
      ['Material cost per received good roll',amount(perGood),'focus'],
      ['Potential waste / unaccounted rolls',rolls(potentialWasteRolls),'warning'],
      ['Potential waste area',sqm(potentialWasteSqm),'warning'],
      ['Potential waste material cost',amount(potentialWasteCost),'warning'],
      ['Received above linked cut rolls',rolls(excessRolls)]
    ];
    return `<div style="font:13px Arial,sans-serif;color:#172b35;padding:25px;width:760px;box-sizing:border-box;background:#fff">
      <div style="border-bottom:4px solid #098e91;padding-bottom:13px"><h1 style="color:#098e91;margin:0;font-size:28px">SoftCreation</h1><h2 style="margin:8px 0 4px;font-size:19px">STORES GRN · PRODUCTION COSTING</h2><div>${escText(g.grnNo||'')}</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0 8px">
        ${tile('Measured JBR input area',sqm(validArea?area:null),'#075985','#e7f5ff','Actual JBR width × measured length')}
        ${tile('Single cut roll area',sqm(sqmPerCut),'#075985','#e7f5ff','Measured area ÷ actual cut rolls')}
        ${tile('Good roll material cost',amount(perGood),'#075943','#e6f8f2','Total input material cost ÷ GRN received rolls')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:8px 0 12px">
        ${tile('Potential waste rolls',rolls(potentialWasteRolls),'#9a3412','#fff1df','Cut rolls not in this GRN receipt')}
        ${tile('Potential waste area',sqm(potentialWasteSqm),'#9a3412','#fff1df','Potential rolls × area per cut roll')}
        ${tile('Potential waste cost',amount(potentialWasteCost),'#9a3412','#fff1df','Potential waste area × current m² rate')}
      </div>
      <div style="padding:9px 11px;background:#fff8e9;border-left:4px solid #d97706;font-size:11px;line-height:1.5"><b>Important — not confirmed scrap:</b> Differences between JBR cut rolls and Stores received rolls may represent stock awaiting dispatch, incomplete packing, rework or real waste. Verify physical reconciliation before recording a waste expense. Estimated waste cost is a portion of total measured material cost; it is <b>not an additional cost</b>.</div>
      <table style="width:100%;border-collapse:collapse;margin-top:13px;font-size:12px">${reportRows.map(x=>field(...x)).join('')}</table>
      <p style="font-size:11px;line-height:1.6;color:#556a75;margin-top:17px">Material-only estimate based on linked fully die-cut JBR widths and processed lengths, using the <b>current</b> Admin material rate. This is not a historical rate snapshot and excludes labor, overheads, packing and other costs. If multiple GRNs share the same JBR batch, these figures are batch-level and must not be summed across separate GRN PDFs. ${escText(jbrInfo.error||'')}</p><p style="font-size:11px">Generated ${new Date().toLocaleString()} · Finance copy</p></div>`;
  }

  // Keep the original report and all of its costing formulas untouched.
  // Paginate its DOM before capturing: each A4 image contains complete table rows.
  function paginateFinanceReportV60(report, mount){
    const source=[...report.children];
    const sourceTable=source.find(el=>el.tagName==='TABLE');
    if(!sourceTable)throw Error('Finance report table not found');
    const sourceRows=[...sourceTable.querySelectorAll('tr')];
    const tableIndex=source.indexOf(sourceTable);
    const pages=[];
    const maxContentBottom=1000; // px at 760px wide; leaves a safe A4 footer margin
    function newPage(continued){
      const page=document.createElement('div');
      page.style.cssText='width:760px;height:1060px;padding:25px;box-sizing:border-box;background:#fff;color:#172b35;font:13px Arial,sans-serif;position:relative;overflow:visible';
      if(continued){
        const header=source[0].cloneNode(true);
        header.style.marginBottom='14px';
        page.appendChild(header);
        const caption=document.createElement('div');
        caption.textContent='PRODUCTION COSTING — CONTINUED';
        caption.style.cssText='font-size:11px;font-weight:800;color:#078b90;margin-bottom:12px';
        page.appendChild(caption);
      }
      mount.appendChild(page);
      pages.push(page);
      return page;
    }
    function fits(page){
      const last=page.lastElementChild;
      if(!last)return true;
      return last.getBoundingClientRect().bottom-page.getBoundingClientRect().top<=maxContentBottom;
    }
    function newTable(page){
      const t=sourceTable.cloneNode(false);
      const body=document.createElement('tbody');
      t.appendChild(body);page.appendChild(t);
      return body;
    }
    let page=newPage(false);
    for(const part of source.slice(0,tableIndex)){
      page.appendChild(part.cloneNode(true));
      if(!fits(page))throw Error('Finance report introduction exceeds one A4 page');
    }
    let tbody=newTable(page);
    for(const row of sourceRows){
      const copy=row.cloneNode(true);
      tbody.appendChild(copy);
      if(!fits(page)){
        tbody.removeChild(copy);
        if(!tbody.children.length)throw Error('Finance PDF row is too tall');
        page=newPage(true);
        tbody=newTable(page);
        tbody.appendChild(copy);
        if(!fits(page))throw Error('Finance PDF row exceeds page height');
      }
    }
    for(const part of source.slice(tableIndex+1)){
      const copy=part.cloneNode(true);
      page.appendChild(copy);
      if(!fits(page)){
        page.removeChild(copy);
        page=newPage(true);
        page.appendChild(copy);
        if(!fits(page))throw Error('Finance PDF notes exceed page height');
      }
    }
    pages.forEach((p,i)=>{
      const foot=document.createElement('div');
      foot.style.cssText='position:absolute;left:25px;right:25px;bottom:15px;padding-top:7px;border-top:1px solid #d4e2e6;font-size:10px;color:#617580;display:flex;justify-content:space-between';
      foot.innerHTML='<span>SoftCreation · Finance production costing</span><span>Page '+(i+1)+' / '+pages.length+'</span>';
      p.appendChild(foot);
    });
    return pages;
  }

  let activeFinancePdfBlobUrl = null;
  function ensureFinancePdfModalV60(){
    if(byId('scFinancePdfModalV60'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="scFinancePdfModalV60" class="modal">
        <div class="modal-card" style="max-width:960px;width:95vw;height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden">
          <div class="modal-head" style="padding:12px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
            <div>
              <b id="scFinancePdfModalTitleV60" style="font-size:15px;color:#0f172a">Finance Costing PDF Preview</b>
              <div id="scFinancePdfModalMetaV60" class="small" style="color:#64748b"></div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button id="scFinancePdfDownloadBtnV60" type="button" class="btn green sm">Download</button>
              <button id="scFinancePdfNewTabBtnV60" type="button" class="btn ghost sm">Open in New Tab</button>
              <button class="closex" type="button" onclick="closeFinancePdfModalV60()">×</button>
            </div>
          </div>
          <div class="modal-body" style="flex:1;padding:0;overflow:hidden;background:#525659">
            <iframe id="scFinancePdfIframeV60" style="width:100%;height:100%;border:none;" title="Finance Costing PDF Preview"></iframe>
          </div>
        </div>
      </div>
    `);
  }
  function openFinancePdfModalV60(grnNo, blobUrl, filename){
    ensureFinancePdfModalV60();
    if(activeFinancePdfBlobUrl && activeFinancePdfBlobUrl !== blobUrl){
      try{URL.revokeObjectURL(activeFinancePdfBlobUrl)}catch(_){}
    }
    activeFinancePdfBlobUrl = blobUrl;
    const titleEl = byId('scFinancePdfModalTitleV60');
    if(titleEl) titleEl.textContent = 'Costing Report · ' + String(grnNo);
    const metaEl = byId('scFinancePdfModalMetaV60');
    if(metaEl) metaEl.textContent = filename;
    const iframe = byId('scFinancePdfIframeV60');
    if(iframe) iframe.src = blobUrl;
    const dlBtn = byId('scFinancePdfDownloadBtnV60');
    if(dlBtn) dlBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
    };
    const tabBtn = byId('scFinancePdfNewTabBtnV60');
    if(tabBtn) tabBtn.onclick = () => window.open(blobUrl, '_blank');
    byId('scFinancePdfModalV60').classList.add('show');
  }
  window.closeFinancePdfModalV60 = function(){
    const modal = byId('scFinancePdfModalV60');
    if(modal) modal.classList.remove('show');
    const iframe = byId('scFinancePdfIframeV60');
    if(iframe) iframe.src = 'about:blank';
  };

  window.scFinanceCostingPdfV60=async function(id, mode='download'){
    if(!allowed())return toast('Finance access required');
    const g=grns().find(x=>String(x.id)===String(id));if(!g||!financeReady(g))return toast('GRN not ready for Finance');
    const r=jobFor(g),jbr=await loadJbrFor(r);
    const node=document.createElement('div');node.style='position:fixed;left:-12000px;top:0;z-index:-1';document.body.append(node);
    toast(mode==='view'?'Preparing PDF preview...':'Generating PDF download...');
    try{
      const report=document.createElement('div');report.innerHTML=htmlReport(g,r,jbr);
      const pages=paginateFinanceReportV60(report.firstElementChild,node);
      const okC=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
      const okP=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
      if(!okC||!okP)throw Error('PDF libraries unavailable');
      const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
      for(let i=0;i<pages.length;i++){
        const canvas=await html2canvas(pages[i],{scale:1.8,backgroundColor:'#fff'});
        if(i)pdf.addPage();
        // Each 760x1060px page fits fully in the A4 printable area, without image offsets/cropping.
        pdf.addImage(canvas.toDataURL('image/jpeg',0.93),'JPEG',10,10,190,265);
      }
      const filename='Finance_'+String(g.grnNo||g.id).replace(/[^a-z0-9_-]/gi,'-')+'.pdf';
      if(mode==='view'){
        const blob=pdf.output('blob');
        const blobUrl=URL.createObjectURL(blob);
        openFinancePdfModalV60(g.grnNo||g.id, blobUrl, filename);
      } else {
        pdf.save(filename);
      }
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
      const viewPdf=evt.target.closest('[data-grn-view-pdf]');if(viewPdf){scFinanceCostingPdfV60(viewPdf.dataset.grnViewPdf,'view');return}
      const pdf=evt.target.closest('[data-grn-pdf]');if(pdf){scFinanceCostingPdfV60(pdf.dataset.grnPdf,'download');return}
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
