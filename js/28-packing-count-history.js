
/* V1.0.58 - Packing Count History / View Packed Counts
   Read-only history for the exact grouped production product. */
(function(){
  const PACK_HISTORY_REST_V1058='https://qyxgamverzdmhtvezbft.supabase.co/rest/v1';
  const PACK_HISTORY_WORKSPACE_V1058='softcreation_main';
  const PACK_HISTORY_KEY_STORE_V1058='spgs_supabase_browser_key_v1';
  const PACK_HISTORY_TABLE_V1058='spgs_product_packing_batches';

  function packHistoryApiKeyV1058(){
    let key=localStorage.getItem(PACK_HISTORY_KEY_STORE_V1058)||'';
    if(!key){
      key=prompt('SoftCreation cloud setup\n\nPaste the FULL Supabase anon / publishable key for qyxgamverzdmhtvezbft:')||'';
      key=key.trim();
      if(key)localStorage.setItem(PACK_HISTORY_KEY_STORE_V1058,key);
    }
    return key;
  }

  function packHistoryHeadersV1058(extra={}){
    const key=packHistoryApiKeyV1058();
    if(!key)throw new Error('Supabase key is not configured.');
    const h={apikey:key,...extra};
    if(key.startsWith('eyJ'))h.Authorization='Bearer '+key;
    return h;
  }

  async function packHistoryFetchV1058(path,options={}){
    const res=await fetch(PACK_HISTORY_REST_V1058+path,{
      ...options,
      headers:packHistoryHeadersV1058(options.headers||{})
    });
    if(!res.ok){
      const body=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase ${res.status}: ${body.slice(0,500)}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    return text?JSON.parse(text):null;
  }

  function packHistoryGroupV1058(){
    const marker=$('packingReqId')?.value||'';
    if(!marker.startsWith('BATCHV1040::'))return null;
    const encodedKey=marker.slice('BATCHV1040::'.length);
    const key=decodeURIComponent(encodedKey||'');
    try{
      if(typeof groupByKeyV1040==='function'){
        const g=groupByKeyV1040(encodedKey);
        if(g)return g;
      }
    }catch(_){}
    try{
      return (productionProductGroupsV103()||[]).find(x=>x.key===key)||null;
    }catch(_){return null}
  }

  function packHistoryBoxesV1058(value){
    if(Array.isArray(value))return value;
    if(typeof value==='string'){
      try{
        const parsed=JSON.parse(value);
        return Array.isArray(parsed)?parsed:[];
      }catch(_){return []}
    }
    return [];
  }

  function packHistoryDateV1058(value){
    if(!value)return '-';
    try{return new Date(value).toLocaleString()}catch(_){return String(value)}
  }

  function ensurePackHistoryModalV1058(){
    if($('packingHistoryModalV1058'))return;
    document.body.insertAdjacentHTML('beforeend',`
      <div id="packingHistoryModalV1058" class="modal">
        <div class="modal-card pack-history-card-v1058">
          <div class="modal-head">
            <div>
              <b>Packed Count History</b>
              <div id="packHistoryMetaV1058" class="small"></div>
            </div>
            <button class="closex" type="button" onclick="closeModal('packingHistoryModalV1058')">×</button>
          </div>
          <div class="modal-body">
            <div id="packHistorySummaryV1058"></div>
            <div id="packHistoryListV1058">
              <div class="empty">Loading packed-count history...</div>
            </div>
          </div>
        </div>
      </div>`);
  }

  async function renderPackHistoryV1058(g){
    const list=$('packHistoryListV1058');
    const summary=$('packHistorySummaryV1058');
    if(!list||!summary)return;

    list.innerHTML='<div class="empty">Loading packed-count history from database...</div>';
    summary.innerHTML='';

    let rows;
    try{
      rows=await packHistoryFetchV1058(
        `/${PACK_HISTORY_TABLE_V1058}?workspace=eq.${encodeURIComponent(PACK_HISTORY_WORKSPACE_V1058)}&product_key=eq.${encodeURIComponent(g.key)}&order=created_at.desc&select=*`
      );
    }catch(e){
      console.error(e);
      list.innerHTML=`<div class="notice"><b>Could not load packed counts:</b> ${esc(e.message)}</div>`;
      return;
    }

    rows=Array.isArray(rows)?rows:[];
    if(!rows.length){
      list.innerHTML=`<div class="empty">No saved packing records yet for ${esc(g.size)} • ${esc(g.material)}.</div>`;
      return;
    }

    const latest=rows[0]||{};
    const latestBoxes=packHistoryBoxesV1058(latest.boxes);
    const latestBoxRolls=latestBoxes.reduce((n,b)=>n+Number(b.roll_count??b.rolls??0),0);
    const latestLoose=Number(latest.loose_rolls||0);
    const latestTotal=Number(latest.packed_total||0);

    summary.innerHTML=`
      <div class="pack-history-summary-v1058">
        <div><span>Saved Records</span><b>${rows.length}</b><small>packing / QC snapshots</small></div>
        <div><span>Latest Boxes</span><b>${latestBoxes.length}</b><small>${money(latestBoxRolls)} rolls in boxes</small></div>
        <div><span>Latest Loose</span><b>${money(latestLoose)}</b><small>rolls</small></div>
        <div><span>Latest Packed Total</span><b>${money(latestTotal)}</b><small>Actual received ${money(Number(latest.actual_received_rolls??latestTotal))}</small></div>
      </div>`;

    list.innerHTML=rows.map((r,index)=>{
      const boxes=packHistoryBoxesV1058(r.boxes);
      const boxRows=boxes.length
        ? boxes.map((b,i)=>`
            <tr>
              <td>${esc(String(b.box_no??b.boxNo??String(i+1).padStart(2,'0')))}</td>
              <td class="num"><b>${money(Number(b.roll_count??b.rolls??0))}</b></td>
              <td>${esc(String(b.note||''))}</td>
            </tr>`).join('')
        : `<tr><td colspan="3" class="small">No cartons recorded in this snapshot.</td></tr>`;

      const total=Number(r.packed_total||0);
      const jbr=Number(r.jbr_planned_rolls??r.jbr_actual_cut_rolls??0);
      const physicalMax=Number(r.jbr_theoretical_max_rolls??jbr);
      const actualReceived=Number(r.actual_received_rolls??total);
      const variance=Number(r.production_variance_rolls??(actualReceived-jbr));

      return `
        <div class="pack-history-entry-v1058">
          <div class="pack-history-entry-head-v1058">
            <div>
              <b>${esc(String(r.stage||'Packing Snapshot'))}</b>
              <span>${packHistoryDateV1058(r.created_at)} • ${esc(String(r.packed_by_display||r.packed_by_username||'-'))}</span>
            </div>
            <span class="tag">${esc(String(r.qc_result||'-'))}</span>
          </div>

          <div class="pack-history-kpis-v1058">
            <div><span>Boxes</span><b>${money(Number(r.box_count??boxes.length))}</b></div>
            <div><span>Box Rolls</span><b>${money(Number(r.box_rolls||0))}</b></div>
            <div><span>Loose</span><b>${money(Number(r.loose_rolls||0))}</b></div>
            <div><span>Packed Total</span><b>${money(total)}</b></div>
            <div><span>Actual Received</span><b>${money(actualReceived)}</b></div>
            <div><span>JBR Planned</span><b>${money(jbr)}</b></div>
            <div><span>Physical Max</span><b>${money(physicalMax)}</b></div>
            <div><span>Variance</span><b>${variance>0?'+':''}${money(variance)}</b></div>
          </div>

          <div class="tablewrap">
            <table class="table pack-history-table-v1058">
              <thead><tr><th>Box</th><th>Rolls</th><th>Note</th></tr></thead>
              <tbody>${boxRows}</tbody>
            </table>
          </div>

          <div class="pack-history-core-v1058">
            <div><span>Roll Core Width</span><b>${money(Number(r.roll_width_mm||0))} mm</b></div>
            <div><span>Core Stick Length</span><b>${money(Number(r.core_stick_length_mm||0))} mm</b></div>
            <div><span>Core Used</span><b>${money(Number(r.core_mm_used||0))} mm</b></div>
            <div><span>Core Sticks</span><b>${money(Number(r.core_sticks_required||0))}</b></div>
            <div><span>Reusable Balance</span><b>${money(Number(r.core_balance_mm||0))} mm</b></div>
          </div>

          ${r.note?`<div class="prod-summary-note"><b>Note:</b> ${esc(String(r.note))}</div>`:''}
        </div>`;
    }).join('');
  }

  window.openPackingHistoryV1058=async function(){
    const g=packHistoryGroupV1058();
    if(!g)return toast('Packed count history is available only for a grouped production batch.');
    ensurePackHistoryModalV1058();
    $('packHistoryMetaV1058').textContent=`${g.size} • ${g.material} • ${g.layout} • ${money(g.pcs)} pcs / ${g.unit}`;
    $('packingHistoryModalV1058').classList.add('show');
    await renderPackHistoryV1058(g);
  };

  function ensurePackHistoryButtonV1058(){
    const modal=$('packingModal');
    if(!modal)return;
    const head=modal.querySelector('.modal-head');
    if(!head||head.querySelector('.pack-history-view-btn-v1058'))return;

    const close=head.querySelector('.closex');
    const wrap=document.createElement('div');
    wrap.className='pack-history-head-actions-v1058';

    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn pack-history-view-btn-v1058 sm';
    btn.textContent='View Packed Counts';
    btn.onclick=()=>openPackingHistoryV1058();

    if(close){
      head.insertBefore(wrap,close);
      wrap.appendChild(btn);
      wrap.appendChild(close);
    }else{
      wrap.appendChild(btn);
      head.appendChild(wrap);
    }
  }

  function installPackingHistoryV1058(){
    if(window.__packingHistoryV1058Installed)return;
    window.__packingHistoryV1058Installed=true;

    const baseOpen=window.openGroupedPackingV1040;
    if(typeof baseOpen==='function'){
      window.openGroupedPackingV1040=async function(){
        const r=await baseOpen.apply(this,arguments);
        setTimeout(()=>{
          const modal=$('packingModal');
          if(!modal?.classList.contains('show'))return;
          ensurePackHistoryButtonV1058();
        },30);
        return r;
      };
      try{openGroupedPackingV1040=window.openGroupedPackingV1040}catch(_){}
    }

    // Also install immediately in case the packing modal already exists.
    ensurePackHistoryButtonV1058();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPackingHistoryV1058,{once:true});
  else installPackingHistoryV1058();
})();
