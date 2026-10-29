
/* Finance: job-level costing, individual PDFs and 5-job pagination.
   Read-only use of the existing financeDatasetV1059 cost snapshots and adjustments. */
(function(){
  const pageSize=5;
  let financeEpoch=0;
  let cache=new Map();
  const $f=id=>document.getElementById(id);
  const allow=()=>typeof currentUser!=='undefined' && (currentUser?.role==='admin'||hasPerm('finance_view'));
  const money2=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function costLabel(x){return x&&x.cost&&Number(x.cost.costPerRoll)>0?`LKR ${money2(x.totalCost)}`:'Cost unavailable'}
  window.downloadFinanceJobPdfV2026=async function(id){
    if(!allow())return toast('Finance access is required');
    const x=cache.get(String(id));
    if(!x)return toast('Job cost data not loaded. Refresh Finance.');
    const r=x.r||{};const costOK=Number(x.cost?.costPerRoll)>0;
    const table=[
      ['Production job',r.orderNo||'-'],['Customer',r.customerName||'-'],['Source PI',r.piSerial||'-'],
      ['Product',[r.size,r.material,r.layout,`${money2(r.pcs||0)} pcs/roll`].filter(Boolean).join(' / ')],
      ['Job status',r.status||'-'],['Requested',`${money2(r.requestQty)} ${r.unit||'rolls'}`],
      ['Finished',`${money2(x.actualQty)} ${r.unit||'rolls'}`],
      ['Cost per roll',costOK?'LKR '+money2(x.cost.costPerRoll):'Unavailable'],
      ['Estimated production cost',costOK?'LKR '+money2(x.productionCost):'Unavailable'],
      ['Additional recorded costs','LKR '+money2(x.adj?.total||0)],
      ['TOTAL ESTIMATED JOB COST',costLabel(x)],
      ['Cost basis',costOK?'Saved cost snapshot × finished quantity + recorded adjustments':'No valid cost-per-roll snapshot; total not determined']
    ];
    const report=document.createElement('div');
    report.style='position:fixed;left:-10000px;top:0;width:794px;padding:46px;background:#fff;color:#1a2b40;font:15px Arial,sans-serif;box-sizing:border-box;z-index:-1';
    report.innerHTML=`<div style="border-bottom:4px solid #078f92;padding-bottom:18px"><h1 style="margin:0;color:#078f92">SoftCreation</h1><div style="font-weight:700;font-size:23px;margin-top:8px">PRODUCTION JOB COST REPORT</div><div style="color:#647687;font-size:13px">Internal Finance · Estimated costing · ${safe(new Date().toLocaleString())}</div></div><table style="width:100%;border-collapse:collapse;margin-top:28px">${table.map(([a,b],i)=>`<tr style="background:${i===10?'#e9f7f4':i%2?'#f6f9fa':'#fff'}"><td style="padding:12px;border-bottom:1px solid #dce5e8;width:43%;font-weight:700">${safe(a)}</td><td style="padding:12px;border-bottom:1px solid #dce5e8">${safe(b)}</td></tr>`).join('')}</table><div style="margin-top:35px;color:#526575;font-size:12px;line-height:1.5">Cost estimates are based on the saved unit-cost snapshot and recorded job adjustments. They are not fully reconciled manufacturing actuals. Shared material usage and waste are not double-counted.</div>`;
    document.body.appendChild(report);
    try{
      const okCanvas=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',()=>window.html2canvas);
      const okPdf=await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',()=>window.jspdf);
      if(!okCanvas||!okPdf)return toast('PDF libraries are unavailable');
      const canvas=await window.html2canvas(report,{scale:2,backgroundColor:'#fff'});
      const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const width=190,height=canvas.height*width/canvas.width;
      let remaining=height,y=10;
      const img=canvas.toDataURL('image/jpeg',0.94);
      pdf.addImage(img,'JPEG',10,y,width,height);remaining-=277;
      while(remaining>0){pdf.addPage();y-=277;pdf.addImage(img,'JPEG',10,y,width,height);remaining-=277}
      pdf.save(`Finance_Job_Cost_${String(r.orderNo||id).replace(/[^A-Za-z0-9_-]/g,'-')}.pdf`);
    }catch(e){console.error('Finance cost PDF',e);toast('Unable to generate job cost PDF: '+(e.message||e))}
    finally{report.remove()}
  };
  function install(){
    if(window.__financeCostPdfInstalledV2026)return;
    if(typeof window.renderFinanceV1059!=='function'||typeof window.financeCostDatasetV2026!=='function')return;
    window.__financeCostPdfInstalledV2026=true;
    const prior=window.renderFinanceV1059;
    window.renderFinanceV1059=async function(force=false){
      const token=++financeEpoch;
      const ret=await prior.apply(this,arguments);
      if(token!==financeEpoch||!allow())return ret;
      try{
        const records=await window.financeCostDatasetV2026(force);
        if(token!==financeEpoch)return ret;
        cache=new Map(records.map(x=>[String(x.r.id),x]));
        const cards=[...($f('financeJobsV1059')?.querySelectorAll('.finance-usage-card-v1060')||[])];
        for(const card of cards){
          const viewBtn=card.querySelector('button[onclick*="openFinanceJobV1059"]');
          const id=viewBtn?.getAttribute('onclick')?.match(/openFinanceJobV1059\('([^']+)'\)/)?.[1];
          if(!id)continue;
          const x=cache.get(String(id));if(!x)continue;
          card.querySelector('.finance-job-cost-v2026')?.remove();
          const summary=document.createElement('div');summary.className='finance-job-cost-v2026';
          summary.innerHTML=`<div><small>Total estimated job cost</small><strong>${costLabel(x)}</strong></div><div><small>Cost / roll</small><b>${Number(x.cost?.costPerRoll)>0?'LKR '+money2(x.cost.costPerRoll):'Unavailable'}</b></div><div><small>Extra recorded costs</small><b>LKR ${money2(x.adj?.total||0)}</b></div>`;
          const actions=card.querySelector('.actions');
          if(actions){actions.before(summary);let btn=actions.querySelector('.finance-cost-pdf-v2026');
            if(!btn){btn=document.createElement('button');btn.className='btn primary sm finance-cost-pdf-v2026';btn.type='button';btn.textContent='Job Cost PDF';actions.appendChild(btn)}
            btn.onclick=()=>window.downloadFinanceJobPdfV2026(String(id));
          }
        }
        // Earlier Finance pagination continues to own the 5-per-page UI.
        if(typeof window.financeGoPageV1066==='function'){
          const active=$f('financePagerV1066')?.querySelector('.finance-page-btn-v1066.active');
          window.financeGoPageV1066(Number(active?.textContent||1));
        }
      }catch(e){console.error('Finance job cost render',e)}
      return ret;
    };
    try{renderFinanceV1059=window.renderFinanceV1059}catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
