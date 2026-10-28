
/* =========================================================
   v1.0.20 — CLEAN CONTINUATION PAGE QUOTATION RENDERING
   ---------------------------------------------------------
   Purpose:
   - Preserve the original quotation font sizes and spacing.
   - When content exceeds one A4 page, create real additional
     A4 pages instead of shrinking the first page.
   - Keep the quotation title/customer block on page 1 only.
   - Continuation pages keep the same letterhead/footer but do
     not repeat quotation/customer header details.
   - Repeat table headings when item rows continue.
   - Keep Preview and generated PDF page breaks identical.
   - Existing PI rendering/business logic remains unchanged.
   ========================================================= */
(function(){
  const SC_QUOTE_PAGE_WIDTH=794;
  const SC_QUOTE_PAGE_HEIGHT=1123;

  function scQuoteIsPagedDocument(doc){
    return !!doc && doc.type==='Q';
  }

  function scResetPaperTargetV1019(target){
    if(!target)return;
    target.className='paper';
    target.removeAttribute('style');
  }

  function scQuotationSourceV1019(doc){
    const tpl=document.createElement('template');
    tpl.innerHTML=String(buildDocHTML(doc,true)||'').trim();
    const body=tpl.content.querySelector('.docbody');
    const footer=tpl.content.querySelector('.docfoot');
    if(!body)throw new Error('Quotation document body was not generated.');
    return {body,footer};
  }

  function scDirectChildByClassV1019(parent,className){
    return [...(parent?.children||[])].find(el=>el.classList?.contains(className))||null;
  }

  function scQuoteMeasureHostV1019(){
    const host=document.createElement('div');
    host.className='sc-quote-measure-host';
    document.body.appendChild(host);
    return host;
  }

  function scQuoteOverflowV1019(body){
    return body.scrollHeight>body.clientHeight+1;
  }

  function scQuoteHasPayloadV1019(body){
    return body.children.length>Number(body.dataset.scBaseChildren||0);
  }

  function scQuotePageV1019(host,sourceBody,footerTemplate,pageIndex){
    const paper=document.createElement('div');
    paper.className='paper sc-quote-page';
    paper.dataset.scQuotePage=String(pageIndex+1);

    const body=document.createElement('div');
    body.className='docbody sc-quote-page-body';

    const sourceHead=scDirectChildByClassV1019(sourceBody,'dochead');
    const sourceCustomer=scDirectChildByClassV1019(sourceBody,'customerbox');

    /*
      Page 1 keeps the normal quotation header/customer details.
      Page 2+ intentionally omit this whole block so continuation
      pages begin directly with the remaining quotation content.
      The A4 letterhead background and document footer still repeat.
    */
    if(pageIndex===0){
      if(sourceHead)body.appendChild(sourceHead.cloneNode(true));
      if(sourceCustomer)body.appendChild(sourceCustomer.cloneNode(true));
    }

    body.dataset.scBaseChildren=String(body.children.length);
    paper.appendChild(body);

    if(footerTemplate){
      const footer=footerTemplate.cloneNode(true);
      const spans=[...footer.querySelectorAll('span')];
      const right=spans[spans.length-1];
      if(right)right.dataset.scFooterBase=right.textContent||'';
      paper.appendChild(footer);
    }

    host.appendChild(paper);
    return {paper,body};
  }

  function scQuoteTableSkeletonV1019(sourceTable){
    const table=sourceTable.cloneNode(true);
    let tbody=table.querySelector('tbody');
    if(!tbody){
      tbody=document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML='';
    return {table,tbody};
  }

  function scQuoteTermsShellV1019(sourceTerms){
    const shell=sourceTerms.cloneNode(true);
    shell.querySelectorAll('.termrow').forEach(row=>row.remove());
    return shell;
  }

  function scBuildQuotationPagesV1019(doc){
    const source=scQuotationSourceV1019(doc);
    const host=scQuoteMeasureHostV1019();
    const pages=[];
    let ctx=null;

    const newPage=()=>{
      ctx=scQuotePageV1019(host,source.body,source.footer,pages.length);
      pages.push(ctx);
      return ctx;
    };

    const appendAtomic=(node)=>{
      const hadPayload=scQuoteHasPayloadV1019(ctx.body);
      let clone=node.cloneNode(true);
      ctx.body.appendChild(clone);
      if(scQuoteOverflowV1019(ctx.body) && hadPayload){
        clone.remove();
        newPage();
        clone=node.cloneNode(true);
        ctx.body.appendChild(clone);
      }
    };

    const appendTable=(sectionSource,tableSource)=>{
      const sourceRows=[...tableSource.querySelectorAll('tbody > tr')];

      const startTable=(moveIfNeeded=true)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        const section=sectionSource.cloneNode(true);
        const parts=scQuoteTableSkeletonV1019(tableSource);
        ctx.body.appendChild(section);
        ctx.body.appendChild(parts.table);

        if(moveIfNeeded && scQuoteOverflowV1019(ctx.body) && hadPayload){
          section.remove();
          parts.table.remove();
          newPage();
          return startTable(false);
        }
        return parts;
      };

      let parts=startTable(true);

      sourceRows.forEach(rowSource=>{
        let row=rowSource.cloneNode(true);
        parts.tbody.appendChild(row);

        if(scQuoteOverflowV1019(ctx.body)){
          row.remove();

          if(parts.tbody.children.length===0){
            // A single unusually tall row must remain intact; never scale text.
            parts.tbody.appendChild(row);
            return;
          }

          newPage();
          parts=startTable(false);
          row=rowSource.cloneNode(true);
          parts.tbody.appendChild(row);
        }
      });
    };

    const appendDeviceSection=(sectionSource,cardSources)=>{
      let section=null;
      let cardsOnCurrentPage=0;

      const startSection=(cardSource,allowMove)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        section=sectionSource.cloneNode(true);
        const card=cardSource.cloneNode(true);
        ctx.body.appendChild(section);
        ctx.body.appendChild(card);

        if(allowMove && scQuoteOverflowV1019(ctx.body) && hadPayload){
          section.remove();
          card.remove();
          newPage();
          return startSection(cardSource,false);
        }
        cardsOnCurrentPage=1;
      };

      if(!cardSources.length){
        appendAtomic(sectionSource);
        return;
      }

      startSection(cardSources[0],true);

      cardSources.slice(1).forEach(cardSource=>{
        let card=cardSource.cloneNode(true);
        ctx.body.appendChild(card);
        if(scQuoteOverflowV1019(ctx.body)){
          card.remove();
          newPage();
          section=sectionSource.cloneNode(true);
          ctx.body.appendChild(section);
          card=cardSource.cloneNode(true);
          ctx.body.appendChild(card);
          cardsOnCurrentPage=1;
        }else{
          cardsOnCurrentPage++;
        }
      });
    };

    const appendTerms=(termsSource,prefaceSource=null)=>{
      const rows=[...termsSource.querySelectorAll('.termrow')];

      const startTerms=(includePreface,moveIfNeeded=true)=>{
        const hadPayload=scQuoteHasPayloadV1019(ctx.body);
        const added=[];

        if(includePreface && prefaceSource){
          const preface=prefaceSource.cloneNode(true);
          ctx.body.appendChild(preface);
          added.push(preface);
        }

        const shell=scQuoteTermsShellV1019(termsSource);
        ctx.body.appendChild(shell);
        added.push(shell);

        if(moveIfNeeded && scQuoteOverflowV1019(ctx.body) && hadPayload){
          added.forEach(el=>el.remove());
          newPage();
          return startTerms(includePreface,false);
        }
        return shell;
      };

      let shell=startTerms(!!prefaceSource,true);

      rows.forEach(rowSource=>{
        let row=rowSource.cloneNode(true);
        shell.appendChild(row);

        if(scQuoteOverflowV1019(ctx.body)){
          row.remove();

          if(shell.querySelectorAll('.termrow').length===0){
            shell.appendChild(row);
            return;
          }

          newPage();
          shell=startTerms(false,false);
          row=rowSource.cloneNode(true);
          shell.appendChild(row);
        }
      });
    };

    newPage();

    const headerNodes=new Set([
      scDirectChildByClassV1019(source.body,'dochead'),
      scDirectChildByClassV1019(source.body,'customerbox')
    ].filter(Boolean));

    const content=[...source.body.children].filter(node=>!headerNodes.has(node));

    for(let i=0;i<content.length;i++){
      const node=content[i];
      const next=content[i+1]||null;

      if(node.classList?.contains('docsection') && next?.tagName==='TABLE'){
        appendTable(node,next);
        i++;
        continue;
      }

      if(node.classList?.contains('docsection') && next?.classList?.contains('device-quote-card')){
        const cards=[];
        let j=i+1;
        while(j<content.length && content[j].classList?.contains('device-quote-card')){
          cards.push(content[j]);
          j++;
        }
        appendDeviceSection(node,cards);
        i=j-1;
        continue;
      }

      if(node.classList?.contains('delivery-doc-note') && next?.classList?.contains('terms')){
        appendTerms(next,node);
        i++;
        continue;
      }

      if(node.classList?.contains('terms')){
        appendTerms(node,null);
        continue;
      }

      appendAtomic(node);
    }

    const total=pages.length;
    pages.forEach((pageCtx,index)=>{
      const footer=pageCtx.paper.querySelector('.docfoot');
      if(!footer)return;
      const spans=[...footer.querySelectorAll('span')];
      const right=spans[spans.length-1];
      if(right){
        const base=right.dataset.scFooterBase||right.textContent||'';
        right.textContent=`${base} • Page ${index+1} of ${total}`;
      }
    });

    const detached=pages.map(x=>x.paper);
    detached.forEach(page=>page.remove());
    host.remove();
    return detached;
  }

  function scRenderQuotationV1019(target,doc){
    if(!target)return;
    const pages=scBuildQuotationPagesV1019(doc);
    target.innerHTML='';
    target.className='paper-stack sc-quotation-stack';
    const fragment=document.createDocumentFragment();
    pages.forEach(page=>fragment.appendChild(page));
    target.appendChild(fragment);
  }

  async function scWaitForQuoteImagesV1019(root){
    const images=[...root.querySelectorAll('img')];
    await Promise.all(images.map(img=>{
      if(img.complete)return Promise.resolve();
      return new Promise(resolve=>{
        const done=()=>resolve();
        img.addEventListener('load',done,{once:true});
        img.addEventListener('error',done,{once:true});
        setTimeout(done,4000);
      });
    }));
  }

  /* Preview: preserve original font sizes and create true continuation pages. */
  const scBaseRenderCurrentV1019=renderCurrent;
  renderCurrent=function(){
    const target=$('paper');
    scResetPaperTargetV1019(target);
    const result=scBaseRenderCurrentV1019.apply(this,arguments);
    try{
      const doc=state.current;
      if(scQuoteIsPagedDocument(doc))scRenderQuotationV1019(target,doc);
    }catch(err){
      console.error('Multi-page quotation preview failed',err);
      scResetPaperTargetV1019(target);
      try{target.innerHTML=buildDocHTML(state.current||{},false)}catch(_){ }
    }
    return result;
  };
  window.renderCurrent=renderCurrent;

  /* Saved-document viewer: use the same pages as the PDF. */
  const scBaseViewDocumentV1019=viewDocument;
  viewDocument=function(id){
    const target=$('viewerPaper');
    scResetPaperTargetV1019(target);
    const result=scBaseViewDocumentV1019.apply(this,arguments);
    try{
      const doc=state.docs.find(x=>x.id===id);
      if(scQuoteIsPagedDocument(doc))scRenderQuotationV1019(target,doc);
    }catch(err){
      console.error('Multi-page quotation viewer failed',err);
    }
    return result;
  };
  window.viewDocument=viewDocument;

  /* PDF: one canvas per real A4 quotation page; no text scaling. */
  const scBaseDownloadDocPDFV1019=downloadDocPDF;
  downloadDocPDF=async function(doc){
    if(!scQuoteIsPagedDocument(doc))return scBaseDownloadDocPDFV1019.apply(this,arguments);

    const okCanvas=await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      ()=>window.html2canvas
    );
    const okPdf=await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      ()=>window.jspdf
    );

    if(!okCanvas||!okPdf){
      toast('PDF libraries unavailable - opening browser Print / Save as PDF');
      return printSavedDocument(doc);
    }

    const capture=document.createElement('div');
    capture.className='sc-quote-capture-host';
    const pages=scBuildQuotationPagesV1019(doc);
    pages.forEach(page=>capture.appendChild(page));
    document.body.appendChild(capture);

    try{
      toast(`Generating ${pages.length}-page A4 quotation PDF...`);
      await scWaitForQuoteImagesV1019(capture);

      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'p',unit:'mm',format:'a4',compress:true});
      try{pdf.setDisplayMode(1.0,'continuous','UseNone')}catch(e){}

      for(let i=0;i<pages.length;i++){
        const canvas=await html2canvas(pages[i],{
          scale:4,
          backgroundColor:'#ffffff',
          useCORS:true,
          allowTaint:true,
          logging:false,
          width:SC_QUOTE_PAGE_WIDTH,
          height:SC_QUOTE_PAGE_HEIGHT,
          windowWidth:SC_QUOTE_PAGE_WIDTH,
          windowHeight:SC_QUOTE_PAGE_HEIGHT
        });

        if(i>0)pdf.addPage('a4','p');
        const img=canvas.toDataURL('image/png',1);
        pdf.addImage(img,'PNG',0,0,210,297,`quotePage${i+1}`,'FAST');
      }

      pdf.save((doc.serial||'quotation').replace(/[\\/:*?"<>|]/g,'-')+'.pdf');
      toast(`Quotation PDF generated • ${pages.length} page${pages.length===1?'':'s'}`);
    }catch(err){
      console.error('Multi-page quotation PDF failed',err);
      toast('Direct PDF failed - opening Print / Save as PDF');
      printSavedDocument(doc);
    }finally{
      capture.remove();
    }
  };
  window.downloadDocPDF=downloadDocPDF;

  /* Browser-print fallback with explicit A4 page breaks. */
  const scBasePrintSavedDocumentV1019=printSavedDocument;
  printSavedDocument=function(doc){
    if(!scQuoteIsPagedDocument(doc))return scBasePrintSavedDocumentV1019.apply(this,arguments);

    const printHost=$('printHost');
    if(!printHost)return;
    printHost.innerHTML='';

    const stack=document.createElement('div');
    stack.className='sc-print-stack';
    const pages=scBuildQuotationPagesV1019(doc);
    pages.forEach(page=>stack.appendChild(page));
    printHost.appendChild(stack);
    printHost.style.display='block';

    scWaitForQuoteImagesV1019(stack).finally(()=>{
      setTimeout(()=>{
        window.print();
        printHost.style.display='none';
        printHost.innerHTML='';
      },250);
    });
  };
  window.printSavedDocument=printSavedDocument;

})();
