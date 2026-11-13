/* Saved quotation rescue: no synchronous measurement pagination, canvas or CDN calls.
   Print-ready A4 pages use browser native Save as PDF; customer data stays untouched. */
(function(){
 'use strict';
 const escSafe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const find=id=>state.docs.find(d=>String(d.id)===String(id));
 const visible=doc=>typeof visibleToCurrent!=='function'||visibleToCurrent(doc);
 const notify=s=>{if(typeof toast==='function')toast(s)};
 const pathname=(s)=>String(s||'Quotation').replace(/[\\/:*?"<>|]/g,'-');
 const getSource=doc=>{const t=document.createElement('template');t.innerHTML=buildDocHTML(doc,true);const body=t.content.querySelector('.docbody'),foot=t.content.querySelector('.docfoot');if(!body)throw Error('Quotation content missing');return {body,foot};};
 function rescueOpen(id){
   const d=find(id);if(!d)return;
   if(d.type!=='Q')return previousView(id);
   if(!visible(d))return notify('This document belongs to another user');
   viewingDocId=id;
   showView('viewer');
   const title=document.getElementById('viewerDocTitle'),meta=document.getElementById('viewerDocMeta'),paper=document.getElementById('viewerPaper');
   if(title)title.textContent='Quotation - '+(d.serial||'');
   if(meta)meta.textContent=`${d.customer?.name||''} • ${fmtDate(d.date)} • LKR ${money(docTotals(d).gross)}`+(d.replacedBy?' • REPLACED / VIEW ONLY':'');
   if(paper){
     paper.className='paper sc-saved-quote-light';
     paper.innerHTML=buildDocHTML(d,true);
     // All content stays visible, without the expensive dynamic page-measure loop.
   }
   ['viewerEditBtn','viewerDeleteBtn','viewerPdfBtn'].forEach(id=>{
     const el=document.getElementById(id);if(el)el.style.display=d.replacedBy?'none':'inline-block';
   });
 }
 const previousView=window.viewDocument;
 window.viewDocument=rescueOpen;
 try{viewDocument=rescueOpen}catch(_){ }

 // No per-child DOM scrollHeight measurement; deterministic page grouping is O(n).
 function assemblePages(doc){
   const {body,foot}=getSource(doc);
   const heading=[...body.children].filter(el=>el.classList.contains('dochead')||el.classList.contains('customerbox'));
   const other=[...body.children].filter(el=>!heading.includes(el));
   const pages=[];
   function addPage(first){const p=document.createElement('div');p.className='paper sc-a4-rescue';const b=document.createElement('div');b.className='docbody';p.appendChild(b);if(first)heading.forEach(n=>b.appendChild(n.cloneNode(true)));if(foot)p.appendChild(foot.cloneNode(true));pages.push({p,b});return b;}
   let target=addPage(true);
   if(doc.category==='device'){
     const cards=other.filter(el=>el.classList.contains('device-quote-card'));
     const section=other.find(el=>el.classList.contains('docsection'));
     const suffix=other.filter(el=>!el.classList.contains('device-quote-card')&&el!==section);
     if(section)target.appendChild(section.cloneNode(true));
     let onPage=0;
     cards.forEach((card,i)=>{
       // Conservative allocation: original example 2 cards on page one,
       // 3 on continuation; reserve space for totals and terms on final page.
       const limit=pages.length===1?2:3;
       if(onPage>=limit){target=addPage(false);onPage=0;if(section)target.appendChild(section.cloneNode(true));}
       target.appendChild(card.cloneNode(true));onPage++;
     });
     // Reserve its own continuation when total/terms cannot fit with final device.
     if(onPage>=3 && suffix.length){target=addPage(false);}
     suffix.forEach(el=>target.appendChild(el.cloneNode(true)));
   } else {
     // Each table page retains headings; no expensive measurement or canvas.
     let rowCount=0;
     const section=other.find(el=>el.classList.contains('docsection'));
     for(const el of other){
       if(el.tagName!=='TABLE'){
         if(rowCount>12){target=addPage(false);rowCount=0;}
         target.appendChild(el.cloneNode(true));continue;
       }
       const trs=[...el.querySelectorAll('tbody > tr')];
       const firstLimit=10, continuationLimit=16;
       let idx=0;
       while(idx<trs.length){
         if(rowCount >= (pages.length===1?firstLimit:continuationLimit)){
           target=addPage(false);rowCount=0;
           if(section)target.appendChild(section.cloneNode(true));
         }
         const table=el.cloneNode(true),tbody=table.querySelector('tbody');
         if(tbody)tbody.innerHTML='';
         const capacity=(pages.length===1?firstLimit:continuationLimit)-rowCount;
         const n=Math.max(1,Math.min(capacity,trs.length-idx));
         for(let j=0;j<n;j++)tbody.appendChild(trs[idx+j].cloneNode(true));
         target.appendChild(table);idx+=n;rowCount+=n;
       }
     }
   }
   const total=pages.length;
   pages.forEach(({p},i)=>{
     const foot=p.querySelector('.docfoot');if(foot){const span=foot.querySelector('span');if(span)span.textContent=(span.textContent||'')+` • Page ${i+1} of ${total}`;}
   });
   return pages.map(x=>x.p.outerHTML).join('');
 }
 function openPrintable(doc){
   if(typeof requirePerm==='function'&&!requirePerm('quote_pdf','download document PDFs'))return;
   // Open before doing any work so popup blockers do not leave an endless spinner.
   const win=window.open('','_blank');
   if(!win){notify('Allow popups for SPGS to open the quotation PDF page.');return;}
   try{
     const serial=escSafe(doc.serial||'Quotation');
    const custRaw=String(doc.customer?.name || doc.customer_name || doc.customerName || (typeof doc.customer==='string'?doc.customer:'') || '').trim();
    const titleName=custRaw?`${doc.serial||'Quotation'} - ${custRaw}`:(doc.serial||'Quotation');
    const safeTitle=escSafe(titleName);
     const stylesheet=new URL('index.css',document.baseURI).href;
     const base=new URL('.',document.baseURI).href;
     const pages=assemblePages(doc);
     const html=`<!doctype html><html><head><meta charset="utf-8"><base href="${escSafe(base)}"><title>${safeTitle}</title><link rel="stylesheet" href="${escSafe(stylesheet)}">
 <style>
 html,body{margin:0!important;background:#d9e5e7!important;overflow:auto!important}
 .sc-pdf-actions{position:sticky;top:0;z-index:9999;display:flex;align-items:center;gap:14px;padding:10px 16px;font:14px Arial;background:#18343b;color:white}
 .sc-pdf-actions button{border:0;border-radius:6px;padding:10px 16px;color:white;background:#078f92;font-weight:bold;cursor:pointer}
 .sc-pdf-actions small{opacity:.9}
 .sc-page-stack{display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px}
 .sc-page-stack>.paper{position:relative!important;box-sizing:border-box!important;width:794px!important;height:1123px!important;min-height:1123px!important;max-height:1123px!important;margin:0!important;overflow:hidden!important;transform:none!important;box-shadow:0 8px 24px #788!important;flex:none!important;background:white url('assets/images/paper-bg.png') center/100% 100% no-repeat!important}
 .sc-page-stack>.paper>.docbody{position:absolute!important;top:238px!important;left:58px!important;right:58px!important;bottom:122px!important;overflow:hidden!important}
 .sc-page-stack>.paper>.docfoot{position:absolute!important;left:58px!important;right:58px!important;bottom:101px!important}
 @page{size:A4;margin:0}
 @media print{html,body{width:210mm!important;background:#fff!important;margin:0!important}.sc-pdf-actions{display:none!important}.sc-page-stack{display:block!important;padding:0!important;margin:0!important;width:210mm!important}.sc-page-stack>.paper{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}.sc-page-stack>.paper:last-child{break-after:auto!important;page-break-after:auto!important}.sc-page-stack>.paper>.docbody{top:63mm!important;left:15.4mm!important;right:15.4mm!important;bottom:32mm!important}.sc-page-stack>.paper>.docfoot{left:15.4mm!important;right:15.4mm!important;bottom:26mm!important}}
 </style></head><body><header class="sc-pdf-actions"><strong>${safeTitle}</strong><button type="button" onclick="window.print()">Save PDF / Print</button><small>Choose “Save as PDF” and enable background graphics. No external PDF libraries are needed.</small></header><main class="sc-page-stack">${pages}</main></body></html>`;
     win.document.open();win.document.write(html);win.document.close();win.focus();
     notify('A4 quotation opened. Select Save PDF / Print.');
   }catch(e){console.error('Quotation print preparation failed',e);win.document.body.textContent='Could not build quotation: '+e.message;notify('Quotation page error; check console.');}
 }
 const previousPDF=window.downloadDocPDF;
 function rescuePDF(doc){if(doc&&doc.type==='Q')return openPrintable(doc);return previousPDF.apply(this,arguments);}
 window.downloadDocPDF=rescuePDF;
 try{downloadDocPDF=rescuePDF}catch(_){ }
 window.downloadSavedPDF=async function(id){const d=find(id);if(!d)return;if(d.type==='Q'){if(!visible(d))return notify('This document belongs to another user');return openPrintable(d);}return rescuePDF(d);};
})();
