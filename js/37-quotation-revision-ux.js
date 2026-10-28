
/* =========================================================
   V1.0.77
   QUOTATION LIST + REVISION UX FIX
   ---------------------------------------------------------
   1) Hide PI button after that quotation already generated PI.
   2) Revising a quotation no longer asks browser password.
      Existing feature permission is still enforced.
   3) Clicking Revise does NOT immediately create a revision.
      The revision is committed only when the user actually
      changes something and saves it.
   4) If no meaningful field changed, the quotation stays
      untouched and no false "edited/revised" history is saved.
   ========================================================= */
(function(){
  'use strict';

  /* -------------------------------------------------------
     QUOTATION LIST:
     remove PI button when a PI already exists for that quote.
     ------------------------------------------------------- */
  if(typeof docTable==='function'){
    const docTableBaseV1077=docTable;

    docTable=function(arr,isQ){
      let out=docTableBaseV1077.apply(this,arguments);

      if(!isQ || !Array.isArray(arr))return out;

      arr.forEach(d=>{
        const hasPI=(state.docs||[]).some(
          x=>x?.type==='PI' && x?.sourceQuoteId===d?.id
        );

        if(!hasPI)return;

        const button=
          `<button class="btn navy sm" onclick="convertQuote('${d.id}')">PI</button>`;

        out=out.split(button).join('');
      });

      return out;
    };

    try{window.docTable=docTable}catch(_){}
  }

  /* -------------------------------------------------------
     Meaningful revision snapshot.
     Metadata such as updated timestamps is intentionally
     excluded so simply opening Revise is NOT considered edit.
     ------------------------------------------------------- */
  function revisionSnapshotV1077(d){
    if(!d)return null;

    return {
      type:String(d.type||''),
      category:String(d.category||''),
      date:String(d.date||''),
      payMode:String(d.payMode||''),
      vatMode:String(d.vatMode||''),
      validity:Number(d.validity||0),

      customerId:String(d.customerId||''),
      customer:{
        name:String(d.customer?.name||''),
        phone:String(d.customer?.phone||''),
        email:String(d.customer?.email||''),
        address:String(d.customer?.address||''),
        delivery:String(d.customer?.delivery||''),
        map:String(d.customer?.map||''),
        vat:String(d.customer?.vat||'')
      },

      extraNote:String(d.extraNote||''),
      delivery3:d.delivery3!==false,
      whatsappTracking:d.whatsappTracking!==false,

      deliveryCharge:d.deliveryCharge
        ? {
            method:String(d.deliveryCharge.method||''),
            payable:Number(d.deliveryCharge.payable||0),
            waived:!!d.deliveryCharge.waived,
            label:String(d.deliveryCharge.label||''),
            km:Number(d.deliveryCharge.km||0),
            rate:Number(d.deliveryCharge.rate||0),
            courier:Number(d.deliveryCharge.courier||0),
            cod:Number(d.deliveryCharge.cod||0)
          }
        : null,

      lines:(d.lines||[]).map(l=>({
        use:l?.use!==false,
        itemId:String(l?.itemId||''),
        desc:String(l?.desc||''),
        size:String(l?.size||''),
        material:String(l?.material||''),
        layout:String(l?.layout||''),
        pcs:String(l?.pcs??''),
        qty:Number(l?.qty||0),
        unit:String(l?.unit||''),
        price:Number(l?.price||0)
      }))
    };
  }

  function revisionHasChangesV1077(base,current){
    return JSON.stringify(revisionSnapshotV1077(base)) !==
           JSON.stringify(revisionSnapshotV1077(current));
  }

  /* -------------------------------------------------------
     REVISION START:
     - Permission only.
     - NO documentPasswordOK().
     - Draft stays only in editor until Save.
     ------------------------------------------------------- */
  reviseQuote=function(id){
    if(
      typeof requirePerm==='function' &&
      !requirePerm('delete_docs','revise quotations')
    ){
      return;
    }

    const old=(state.docs||[]).find(x=>x.id===id);

    if(
      !old ||
      old.type!=='Q' ||
      old.replacedBy
    ){
      return toast('Only the active quotation can be revised');
    }

    const note=window.prompt(
      'Briefly state what must be changed in this revision:'
    );

    if(note===null)return;

    if(!String(note).trim()){
      return toast('Enter a revision reason');
    }

    const chain=
      typeof quoteRevisionChain==='function'
        ? quoteRevisionChain(old)
        : [old];

    const nextRev=
      Math.max(
        ...chain.map(x=>Number(x.rev||0)),
        0
      )+1;

    const draft=JSON.parse(
      JSON.stringify(old)
    );

    draft.id=uid('doc');
    draft.rev=nextRev;
    draft.serial=serialFor(
      'Q',
      old.core,
      nextRev
    );

    draft.revisionOf=old.id;
    draft.revisionRootId=
      chain[0]?.id||old.id;

    draft.revisionNote=
      String(note).trim();

    draft.replacedBy=null;
    draft.created=Date.now();

    delete draft.revisedAt;
    delete draft.revisedBy;
    delete draft.revisedByUser;
    delete draft.revisionChanges;
    delete draft.revisionClosedAt;
    delete draft.revisionClosedBy;

    /*
      Temporary insertion is only so the existing openDocument()
      chain can populate the editor. It is removed immediately.
      Therefore no quotation revision exists until Save succeeds.
    */
    state.docs.unshift(draft);

    try{
      openDocument(draft.id);
    }finally{
      state.docs=state.docs.filter(
        x=>x.id!==draft.id
      );
    }

    if(state.current){
      state.current._revisionDraftV1077=true;
      state.current._revisionBaseIdV1077=old.id;
      state.current._revisionReasonV1077=
        String(note).trim();
    }

    toast(
      `${draft.serial} opened as revision draft. Save only after making changes.`
    );
  };

  try{window.reviseQuote=reviseQuote}catch(_){}

  /* -------------------------------------------------------
     REVISION SAVE:
     - If nothing changed: cancel draft, no history, no replacement.
     - If changed: use the full existing save chain, then lock old quote.
     ------------------------------------------------------- */
  if(typeof persistCurrentDocument==='function'){
    const persistBaseV1077=
      persistCurrentDocument;

    persistCurrentDocument=
    async function(){
      const draftFlag=
        !!state.current?._revisionDraftV1077;

      if(!draftFlag){
        return persistBaseV1077.apply(
          this,
          arguments
        );
      }

      const baseId=
        state.current?._revisionBaseIdV1077 ||
        state.current?.revisionOf ||
        '';

      const old=(state.docs||[]).find(
        x=>x.id===baseId
      );

      if(!old){
        toast('Original quotation for this revision was not found');
        return null;
      }

      const current=
        typeof collectCurrent==='function'
          ? collectCurrent()
          : null;

      if(!current){
        toast('Could not read the revision draft');
        return null;
      }

      if(
        !revisionHasChangesV1077(
          old,
          current
        )
      ){
        toast(
          'No changes detected. Revision was not created.'
        );

        state.current=null;

        try{resetEditor(false)}catch(_){}
        try{renderDocLists()}catch(_){}
        try{showView('quotations')}catch(_){}

        return null;
      }

      /*
        Remove temporary-only flags before the existing save chain.
      */
      if(state.current){
        delete state.current._revisionDraftV1077;
        delete state.current._revisionBaseIdV1077;
        delete state.current._revisionReasonV1077;
      }

      current.revisionNote=
        current.revisionNote ||
        state.current?.revisionNote ||
        '';

      const saved=
        await persistBaseV1077.apply(
          this,
          arguments
        );

      if(!saved){
        /*
          Save/validation failed. Restore draft mode so the user
          can fix the problem and try Save again.
        */
        if(state.current){
          state.current._revisionDraftV1077=true;
          state.current._revisionBaseIdV1077=old.id;
        }

        return null;
      }

      const now=
        new Date().toISOString();

      old.replacedBy=saved.id;
      old.revisionClosedAt=now;
      old.revisionClosedBy=
        currentUser?.display ||
        currentUser?.username ||
        '';

      saved.revisionOf=old.id;
      saved.revisionRootId=
        saved.revisionRootId ||
        old.revisionRootId ||
        old.id;

      saved.revisionNote=
        saved.revisionNote ||
        current.revisionNote ||
        '';

      saved.revisedAt=
        saved.revisedAt||now;

      saved.revisedBy=
        saved.revisedBy ||
        currentUser?.display ||
        currentUser?.username ||
        '';

      saved.revisedByUser=
        saved.revisedByUser ||
        currentUser?.username ||
        '';

      if(
        typeof revisionDiff==='function'
      ){
        saved.revisionChanges=
          revisionDiff(old,saved);
      }

      if(typeof audit==='function'){
        audit(
          'CREATE_REVISION',
          `${old.serial} → ${saved.serial}: ${saved.revisionNote||'Revised quotation'}`
        );
      }

      saveState();

      try{renderDocLists()}catch(_){}

      return saved;
    };

    try{
      window.persistCurrentDocument=
        persistCurrentDocument;
    }catch(_){}
  }

})();
