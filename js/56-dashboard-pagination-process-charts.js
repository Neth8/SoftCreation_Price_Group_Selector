/* SoftCreation dashboard-only enhancements. Read-only local data; no auth, save or DB changes. */
(function(){'use strict';
const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});
let page=1,perPage=10,lastSignature='';
function paginate(reset){
 const box=byId('dashResults');if(!box)return;
 const table=box.querySelector('table'),old=byId('scDashPager');if(old)old.remove();
 if(!table)return;
 const rows=Array.from(table.querySelectorAll('tbody tr'));
 const signature=rows.length+'|'+(byId('dashFrom')?.value||'')+'|'+(byId('dashTo')?.value||'')+'|'+(rows[0]?.textContent||'').slice(0,70);
 if(reset||signature!==lastSignature)page=1;lastSignature=signature;
 const pages=Math.max(1,Math.ceil(rows.length/perPage));page=Math.max(1,Math.min(page,pages));
 rows.forEach((row,i)=>{row.style.display=(i>=(page-1)*perPage&&i<page*perPage)?'':'none'});
 const nav=document.createElement('div');nav.id='scDashPager';nav.className='sc-dash-pager';
 nav.innerHTML='<span>Showing '+(rows.length?((page-1)*perPage+1):0)+'–'+Math.min(page*perPage,rows.length)+' of '+rows.length+'</span><div class="sc-dash-pager-actions"><label>Rows <select id="scDashPageSize" aria-label="Dashboard report rows per page"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button class="btn ghost sm" id="scDashPrev" '+(page===1?'disabled':'')+'>Previous</button><strong>Page '+page+' / '+pages+'</strong><button class="btn ghost sm" id="scDashNext" '+(page===pages?'disabled':'')+'>Next</button></div>';
 box.appendChild(nav);byId('scDashPageSize').value=String(perPage);
 byId('scDashPageSize').onchange=e=>{perPage=Number(e.target.value)||10;page=1;paginate(false)};
 byId('scDashPrev').onclick=()=>{page--;paginate(false)};byId('scDashNext').onclick=()=>{page++;paginate(false)};
}
function visibleDocs(){
 const docs=window.state?.docs||[];const from=byId('dashFrom')?.value||'',to=byId('dashTo')?.value||'';
 return docs.filter(d=>{try{return(typeof visibleToCurrent!=='function'||visibleToCurrent(d))&&(!from||String(d.date||'')>=from)&&(!to||String(d.date||'')<=to)&&!d.replacedBy}catch(_){return false}});
}
function barChart(data,maxBars=12){const values=data.slice(-maxBars);const peak=Math.max(1,...values.map(x=>x.value));
 return '<div class="sc-process-bars">'+values.map(x=>'<div class="sc-process-bar-col" title="'+esc(x.label+': '+x.value)+'"><span class="sc-process-bar-value">'+fmt(x.value)+'</span><div class="sc-process-bar-track"><div class="sc-process-bar" style="height:'+Math.max(2,x.value/peak*100)+'%"></div></div><span class="sc-process-bar-label">'+esc(x.label)+'</span></div>').join('')+'</div>';
}
function drawCharts(){const dash=byId('dashboard');if(!dash)return;let host=byId('scDashboardProcessCharts');if(!host){host=document.createElement('div');host.id='scDashboardProcessCharts';host.className='sc-dashboard-process-grid';const bi=byId('scBIPanel');if(bi)bi.parentNode.insertBefore(host,bi);else dash.appendChild(host)}
 const docs=visibleDocs(),qs=docs.filter(d=>d.type==='Q'),pis=docs.filter(d=>d.type==='PI');
 const monthly=new Map();const actors=new Map();for(const d of docs){const month=String(d.date||'').slice(0,7)||'Unknown';monthly.set(month,(monthly.get(month)||0)+1);const actor=String(d.createdBy||d.createdByUser||'Unknown');actors.set(actor,(actors.get(actor)||0)+1)}
 const trend=Array.from(monthly,([label,value])=>({label,value})).sort((a,b)=>a.label.localeCompare(b.label));
 const leaders=Array.from(actors,([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,6);const maxLeader=Math.max(1,...leaders.map(x=>x.value));
 const quoteIds=new Set(qs.map(q=>String(q.id)));const converted=pis.filter(p=>quoteIds.has(String(p.sourceQuoteId||p.source_quote_id||''))).length;
 const conversionPercent=qs.length?Math.min(100,converted/qs.length*100):0;
 host.innerHTML='<section class="sc-bi-card sc-process-card"><h3>Document Activity by Month</h3>'+ (trend.length?barChart(trend):'<p>No activity in this date range.</p>')+'<small>Document counts by document date; respects the Dashboard date filter.</small></section>'+
 '<section class="sc-bi-card sc-process-card"><h3>Quotation → PI Progress</h3><div class="sc-process-metrics"><div><b>'+qs.length+'</b><span>Quotations</span></div><div><b>'+pis.length+'</b><span>Pro Formas</span></div><div><b>'+converted+'</b><span>Linked conversions</span></div></div><div class="sc-process-progress" role="img" aria-label="'+conversionPercent.toFixed(1)+' percent of filtered quotations have a linked PI"><span style="width:'+conversionPercent.toFixed(2)+'%"></span></div><strong>'+conversionPercent.toFixed(1)+'% of visible quotations linked</strong><small>Only counts PIs linked to quotations visible in this date range; not a full business conversion rate.</small></section>'+
 '<section class="sc-bi-card sc-process-card"><h3>Document Activity by User</h3>'+(leaders.length?leaders.map(x=>'<div class="sc-process-user-row"><div><span>'+esc(x.label)+'</span><b>'+fmt(x.value)+'</b></div><div class="sc-process-user-track"><i style="width:'+(x.value/maxLeader*100).toFixed(2)+'%"></i></div></div>').join(''):'<p>No documents in this date range.</p>')+'<small>Top 6 creators by number of visible documents; not sales performance.</small></section>';
}
const original=window.renderDashboardReport;
if(typeof original==='function')window.renderDashboardReport=function(){const r=original.apply(this,arguments);paginate(true);drawCharts();return r};
const show=window.showView;if(typeof show==='function')window.showView=function(id){const r=show.apply(this,arguments);if(id==='dashboard'&&byId('dashboard')?.classList.contains('active')){paginate(false);drawCharts()}return r};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{paginate(true);drawCharts()});else{paginate(true);drawCharts()}
})();
