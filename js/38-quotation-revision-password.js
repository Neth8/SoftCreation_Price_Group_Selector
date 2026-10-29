
/* =========================================================
   V1.0.78
   QUOTATION REVISION PASSWORD + MOBILE TABLE FIX SUPPORT
   ---------------------------------------------------------
   Revision flow:
   1) Keep the existing in-system secure password modal.
   2) Do NOT use native/browser prompt() for password.
   3) Do NOT use native/browser prompt() for revision reason.
   4) Open an in-app Revision Reason modal instead.
   5) Keep V1.0.77 draft-until-save / no-change protection.
   ========================================================= */
(function(){
  'use strict';

  let revisionTargetV1078='';

  function ensureRevisionReasonModalV1078(){
    if(document.getElementById('revisionReasonModalV1078'))return;

    document.body.insertAdjacentHTML('beforeend',`
      <div id="revisionReasonModalV1078" class="modal">
        <div class="modal-card" style="max-width:520px">
          <div class="modal-head">
            <div>
              <b>Revise Quotation</b>
              <div class="small">Enter the reason for this revision.</div>
            </div>
            <button
              class="closex"
              type="button"
              onclick="cancelRevisionReasonV1078()"
            >×</button>
          </div>

          <div class="modal-body">
            <div class="field">
              <label>Revision Reason</label>
              <textarea
                id="revisionReasonInputV1078"
                rows="4"
                placeholder="Example: Quantity changed / price updated / customer requested item change"
              ></textarea>
            </div>

            <div
              id="revisionReasonErrorV1078"
              class="calc-warning"
              style="display:none"
            ></div>

            <div class="actions">
              <button
                class="btn primary"
                type="button"
                onclick="confirmRevisionReasonV1078()"
              >Continue to Revision</button>

              <button
                class="btn ghost"
                type="button"
                onclick="cancelRevisionReasonV1078()"
              >Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  function openRevisionDraftV1078(id,reason){
    const old=(state.docs||[]).find(x=>x.id===id);

    if(
      !old ||
      old.type!=='Q' ||
      old.replacedBy
    ){
      toast('Only the active quotation can be revised');
      return;
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
      String(reason||'').trim();

    draft.replacedBy=null;
    draft.created=Date.now();

    delete draft.revisedAt;
    delete draft.revisedBy;
    delete draft.revisedByUser;
    delete draft.revisionChanges;
    delete draft.revisionClosedAt;
    delete draft.revisionClosedBy;

    /*
      Temporary only for existing openDocument() population.
      It is immediately removed again, so no false revision is
      created until the user actually changes and saves.
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
        String(reason||'').trim();
      state.current.revisionNote=
        String(reason||'').trim();
    }

    toast(
      `${draft.serial} opened as revision draft. Save only after making changes.`
    );
  }

  window.cancelRevisionReasonV1078=function(){
    revisionTargetV1078='';
    const modal=document.getElementById(
      'revisionReasonModalV1078'
    );
    const input=document.getElementById(
      'revisionReasonInputV1078'
    );
    const error=document.getElementById(
      'revisionReasonErrorV1078'
    );

    if(input)input.value='';
    if(error){
      error.textContent='';
      error.style.display='none';
    }
    modal?.classList.remove('show');
  };

  window.confirmRevisionReasonV1078=function(){
    const input=document.getElementById(
      'revisionReasonInputV1078'
    );
    const error=document.getElementById(
      'revisionReasonErrorV1078'
    );

    const reason=String(
      input?.value||''
    ).trim();

    if(!reason){
      if(error){
        error.textContent='Enter a revision reason.';
        error.style.display='block';
      }
      input?.focus();
      return;
    }

    const id=revisionTargetV1078;
    cancelRevisionReasonV1078();

    if(id){
      openRevisionDraftV1078(
        id,
        reason
      );
    }
  };

  /*
    FINAL reviseQuote override.

    documentPasswordOK() is already routed by v1.0.24 through the
    application's secure password modal, with a one-use retry token.
    Therefore this keeps the SYSTEM dialog and never calls native
    prompt() for password.
  */
  window.reviseQuote=function(id){
    if(
      typeof requirePerm==='function' &&
      !requirePerm(
        'delete_docs',
        'revise quotations'
      )
    ){
      return;
    }

    const old=(state.docs||[]).find(
      x=>x.id===id
    );

    if(
      !old ||
      old.type!=='Q' ||
      old.replacedBy
    ){
      toast('Only the active quotation can be revised');
      return;
    }

    if(
      typeof documentPasswordOK==='function' &&
      !documentPasswordOK(
        'revise this quotation'
      )
    ){
      return;
    }

    ensureRevisionReasonModalV1078();

    revisionTargetV1078=id;

    const modal=document.getElementById(
      'revisionReasonModalV1078'
    );
    const input=document.getElementById(
      'revisionReasonInputV1078'
    );
    const error=document.getElementById(
      'revisionReasonErrorV1078'
    );

    if(input)input.value='';
    if(error){
      error.textContent='';
      error.style.display='none';
    }

    modal?.classList.add('show');

    setTimeout(
      ()=>input?.focus(),
      50
    );
  };

  try{
    reviseQuote=window.reviseQuote;
  }catch(_){}

  ensureRevisionReasonModalV1078();

})();
