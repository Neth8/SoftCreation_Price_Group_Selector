/* SPGS V1.1.32: read-only UI additions. No production, login or database writes. */
(function(){'use strict';
const $=id=>document.getElementById(id);
const esc2=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
const endpoint='https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-stock-search';
let stockRows=[],stockPage=1,stockError='',stockLoading=false,stockLoadedAt=0;
function ensureUI(){
  const grid=$('productionProductsGrid');if(grid&&!$('scLowStockBtn')){
    const b=document.createElement('button');b.id='scLowStockBtn';b.type='button';b.className='btn sc-lowstock-btn';b.textContent='⚠ Attention · Brylix ERP Low Stock (≤50)';b.onclick=window.scOpenLowStock;
    const area=grid.closest('.panel-body')||grid.parentElement;area.insertBefore(b,grid);
  }
  const dash=$('dashboard');if(dash&&!$('scBIPanel')){
    const d=document.createElement('div');d.id='scBIPanel';d.className='sc-bi-wrap';dash.appendChild(d);
  }
}
function drawBI(){const host=$('scBIPanel');if(!host||!window.state)return;
  const all=(state.docs||[]).filter(d=>{try{return typeof visibleToCurrent!=='function'||visibleToCurrent(d)}catch(_){return true}});
  const docs=all.filter(d=>!d.replacedBy),q=docs.filter(d=>d.type==='Q'),pi=docs.filter(d=>d.type==='PI');
  const amt=d=>{try{return Number(docTotals(d).gross)||0}catch(_){return 0}};
  const data=[{label:'Quotations',value:q.length,c:'#168f93'},{label:'Pro Forma',value:pi.length,c:'#4969b4'}];
  const total=data.reduce((n,x)=>n+x.value,0);let offset=0;
  const arcs=data.map(x=>{const v=total?x.value/total*100:0;const from=offset;offset+=v;return `${x.c} ${from}% ${offset}%`}).join(',');
  const group={};for(const d of docs){const who=String(d.customer?.name||'Unspecified');(group[who]??={name:who,count:0,value:0});group[who].count++;group[who].value+=amt(d)}
  const top=Object.values(group).sort((a,b)=>b.value-a.value).slice(0,6);
  host.innerHTML=`<div class="sc-bi-card"><h3>Document Mix · Visible to You</h3><div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap"><div aria-label="Quotation and PI mix" style="width:165px;height:165px;flex:none;border-radius:50%;background:conic-gradient(${arcs||'#dfe9ed 0% 100%'})"></div><div class="sc-bi-legend" style="flex:1">${data.map(x=>`<span><span><i class="sc-bi-dot" style="background:${x.c}"></i>${x.label}</span><b>${x.value}</b></span>`).join('')}<span><span>Total documents</span><b>${total}</b></span></div></div><small>Uses already-loaded browser data. No additional Supabase requests.</small></div><div class="sc-bi-card"><h3>Top Customers · Document Value</h3><div class="sc-bi-scroll"><table class="sc-bi-table"><thead><tr><th>Customer</th><th>Docs</th><th>Value (LKR)</th></tr></thead><tbody>${top.length?top.map(x=>`<tr><td>${esc2(x.name)}</td><td>${x.count}</td><td>${fmt(x.value)}</td></tr>`).join(''):'<tr><td colspan="3">No documents loaded</td></tr>'}</tbody></table></div><small>Document totals, not received payments or recognized revenue.</small></div>`;
}
async function retrieveStocks(force){if(stockLoading)return;if(!force&&Date.now()-stockLoadedAt<120000)return;
 stockLoading=true;stockError='';window.scRenderStock();
 try{const key=String(localStorage.getItem('spgs_supabase_browser_key_v1')||'').trim();if(!key)throw Error('ERP connection key is not configured.');
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),15000);let res;
 try{res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key},body:JSON.stringify({q:'',branch_id:2,limit:500}),signal:controller.signal});}finally{clearTimeout(t)}
 const body=await res.json();if(!res.ok||body?.success===false)throw Error(body?.message||body?.error||'ERP service cannot list inventory.');
 const rows=Array.isArray(body?.data)?body.data:(Array.isArray(body?.items)?body.items:null);if(!rows)throw Error('ERP stock response does not contain inventory rows.');
 if(body?.pagination?.has_more||body?.has_more||body?.total>rows.length)throw Error('ERP service returned only part of inventory. An ERP inventory-list endpoint is required for a complete low-stock alert.');
 stockRows=rows.map(r=>({name:String(r.name||r.product_name||r.description||r.item_name||''),code:String(r.code||r.product_code||r.sku||''),qty:Number(r.stock_qty??r.quantity??r.qty??r.stock??r.available_qty)})).filter(x=>Number.isFinite(x.qty)&&x.qty<=50).sort((a,b)=>a.qty-b.qty);stockLoadedAt=Date.now();
 }catch(e){stockRows=[];stockError=String(e.message||e)}finally{stockLoading=false;window.scRenderStock()}
}
window.scOpenLowStock=function(){ensureUI();if(!$('scStockOverlay')){const o=document.createElement('div');o.id='scStockOverlay';o.className='sc-stock-overlay';o.onclick=e=>{if(e.target===o)window.scCloseLowStock()};o.innerHTML=`<div class="sc-stock-dialog" role="dialog" aria-modal="true" aria-label="Brylix low stock"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 style="margin:0;font-size:20px">⚠ Brylix ERP · Low Stock (≤50)</h2><button class="btn ghost sm" onclick="scCloseLowStock()">✕ Close</button></div><div class="sc-stock-controls"><input id="scStockSearch" placeholder="Search product or code" oninput="scStockPage(1)"><button class="btn ghost sm" onclick="scRefreshLowStock()">Refresh ERP</button></div><div id="scStockContent"></div><div id="scStockPager" class="sc-stock-pager"></div></div>`;document.body.appendChild(o)}
 $('scStockOverlay').style.display='flex';stockPage=1;window.scRenderStock();retrieveStocks(false)};
window.scCloseLowStock=function(){const el=$('scStockOverlay');if(el)el.style.display='none'};
window.scRefreshLowStock=function(){stockLoadedAt=0;retrieveStocks(true)};
window.scStockPage=function(p){stockPage=Math.max(1,Number(p)||1);window.scRenderStock()};
window.scRenderStock=function(){const body=$('scStockContent');if(!body)return;const q=String($('scStockSearch')?.value||'').toLowerCase(),data=stockRows.filter(x=>(x.name+' '+x.code).toLowerCase().includes(q)),pages=Math.max(1,Math.ceil(data.length/10));stockPage=Math.min(stockPage,pages);const sliced=data.slice((stockPage-1)*10,stockPage*10);
 body.innerHTML=stockLoading?'<p>Checking current ERP stock…</p>':stockError?`<div class="notice">${esc2(stockError)}<p>Existing ERP integration is search-based. A complete low-stock list requires the backend to support unfiltered inventory queries; no inventory values have been guessed.</p></div>`:data.length?`<div class="sc-bi-scroll"><table class="sc-bi-table"><thead><tr><th>Product</th><th>Code</th><th>Branch 2 stock</th></tr></thead><tbody>${sliced.map(x=>`<tr><td>${esc2(x.name)}</td><td>${esc2(x.code)}</td><td style="color:${x.qty<=0?'#a52c26':'#a6630b'};font-weight:800">${fmt(x.qty)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No low-stock items returned for Branch 2. Refresh to check stock again.</p>';
 const pg=$('scStockPager');pg.innerHTML=stockError||stockLoading?'':`<span>${data.length} low-stock items · page ${stockPage}/${pages}</span><div><button class="btn ghost sm" ${stockPage===1?'disabled':''} onclick="scStockPage(${stockPage-1})">Previous</button> <button class="btn ghost sm" ${stockPage===pages?'disabled':''} onclick="scStockPage(${stockPage+1})">Next</button></div>`;
};
const origRender=window.renderProductionProducts;
if(typeof origRender==='function')window.renderProductionProducts=function(){const result=origRender.apply(this,arguments);ensureUI();return result};
const origShow=window.showView;
if(typeof origShow==='function')window.showView=function(id){const result=origShow.apply(this,arguments);if(id==='dashboard'&&$('dashboard')?.classList.contains('active')){ensureUI();drawBI()}if(id==='productionproducts'&&$('productionproducts')?.classList.contains('active'))ensureUI();return result};
const originalDashboard=window.renderDashboardReport;
if(typeof originalDashboard==='function')window.renderDashboardReport=function(){const result=originalDashboard.apply(this,arguments);if($('dashboard')?.classList.contains('active')){ensureUI();drawBI()}return result};
ensureUI();drawBI();
})();
