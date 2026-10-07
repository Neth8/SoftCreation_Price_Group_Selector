
/* v1.0.12 - Professional ERP autocomplete + live Branch 2 stock */
(function(){

  const ERP_FUNCTION_URL =
    'https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-stock-search';

  const ERP_BRANCH_ID = 2;

  let erpSearchSeq = 0;
  let erpSearchTimer = null;
  let erpRows = [];
  let erpActiveIndex = -1;
  let erpSelectedProduct = null;

  const erpCache = new Map();

  function erpEsc(v){
    return typeof esc === 'function'
      ? esc(String(v ?? ''))
      : String(v ?? '').replace(/[&<>"']/g,c=>({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        }[c]));
  }

  function erpMoney(v,currency='LKR'){
    const n = Number(v);

    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString(undefined,{
          minimumFractionDigits:2,
          maximumFractionDigits:2
        })}`
      : '-';
  }

  function erpStockClass(q){
    q = Number(q || 0);

    if(q <= 0) return 'out';
    if(q <= 5) return 'low';

    return 'ok';
  }

  function erpStockLabel(q){
    q = Number(q || 0);

    if(q <= 0) return 'OUT OF STOCK';
    if(q <= 5) return 'LOW STOCK';

    return 'IN STOCK';
  }

  function erpInitial(name){
    const txt = String(name || '').trim();

    if(!txt) return 'P';

    return txt
      .split(/\s+/)
      .slice(0,2)
      .map(x => x.charAt(0))
      .join('')
      .toUpperCase();
  }

  function erpSupabaseKey(){
    const key =
      (localStorage.getItem('spgs_supabase_browser_key_v1') || '')
      .trim();

    if(!key){
      throw new Error(
        'Supabase browser key is not configured on this device.'
      );
    }

    return key;
  }

  async function erpProxySearch(q){
    const cacheKey = q.toLowerCase();

    if(erpCache.has(cacheKey)){
      return erpCache.get(cacheKey);
    }

    const key = erpSupabaseKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),12000);

    try{
      const res = await fetch(
        ERP_FUNCTION_URL,
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'apikey':key,
            'Authorization':'Bearer ' + key
          },
          body:JSON.stringify({
            q,
            branch_id:ERP_BRANCH_ID
          }),
          signal:controller.signal
        }
      );

      let body = {};

      try{
        body = await res.json();
      }catch(e){}

      if(!res.ok){
        throw new Error(
          body?.error ||
          body?.message ||
          `ERP service returned ${res.status}`
        );
      }

      if(body?.success === false){
        throw new Error(
          body?.error ||
          body?.message ||
          'ERP product search failed.'
        );
      }

      const rows = Array.isArray(body?.data) ? body.data : [];

      erpCache.set(cacheKey,rows);

      if(erpCache.size > 30){
        const first = erpCache.keys().next().value;
        erpCache.delete(first);
      }

      return rows;

    }finally{
      clearTimeout(timer);
    }
  }

  function erpSetStatus(type,text){
    const status = document.getElementById('erpStockStatus');
    if(!status) return;

    status.className =
      'erp-lookup-status' +
      (type ? ' ' + type : '');

    status.innerHTML =
      `<span class="erp-status-dot"></span>${erpEsc(text)}`;
  }

  function erpShowClear(show){
    const btn = document.getElementById('erpStockClear');
    if(!btn) return;

    btn.classList.toggle('show',!!show);
  }

  function erpHideSuggestions(){
    const box = document.getElementById('erpStockSuggestions');
    if(!box) return;

    box.classList.remove('show');
    erpActiveIndex = -1;
  }

  function erpRenderSuggestions(rows){
    const box = document.getElementById('erpStockSuggestions');
    if(!box) return;

    erpRows = rows || [];
    erpActiveIndex = -1;

    if(!erpRows.length){
      box.innerHTML = `
        <div class="erp-suggest-message">
          No ERP products found for this search.
        </div>
      `;

      box.classList.add('show');
      return;
    }

    const visible = erpRows.slice(0,10);

    box.innerHTML =
      visible.map((p,i)=>{
        const qty = Number(p.stock_quantity || 0);
        const cls = erpStockClass(qty);
        const meta =
          [p.category,p.brand]
          .filter(Boolean)
          .join(' • ') || 'ERP Product';

        return `
          <button
            type="button"
            class="erp-suggestion-item"
            data-erp-index="${i}"
            onclick="selectERPStockProductV112(${i})"
          >
            <div class="erp-suggestion-avatar">
              ${erpEsc(erpInitial(p.name))}
            </div>

            <div class="erp-suggestion-main">
              <div class="erp-suggestion-code">
                ${erpEsc(p.code || 'NO CODE')}
              </div>

              <div class="erp-suggestion-name">
                ${erpEsc(p.name || '-')}
              </div>

              <div class="erp-suggestion-meta">
                ${erpEsc(meta)}
              </div>
            </div>

            <div class="erp-suggestion-right">
              <div class="erp-suggestion-price">
                ${erpEsc(
                  erpMoney(
                    p.price,
                    p.currency || 'LKR'
                  )
                )}
              </div>

              <div class="erp-suggestion-stock">
                <strong>
                  ${qty.toLocaleString()}
                </strong>

                <span class="erp-mini-stock ${cls}">
                  ${erpStockLabel(qty)}
                </span>
              </div>
            </div>
          </button>
        `;
      }).join('');

    box.classList.add('show');
  }

  function erpRenderSelected(p){
    const box = document.getElementById('erpStockSelected');
    if(!box) return;

    if(!p){
      box.innerHTML = '';
      return;
    }

    const qty = Number(p.stock_quantity || 0);
    const cls = erpStockClass(qty);
    const category = p.category || '-';
    const brand = p.brand || '-';
    const price = erpMoney(p.price,p.currency || 'LKR');
    const checked = new Date().toLocaleTimeString([],{
      hour:'2-digit',
      minute:'2-digit'
    });

    box.innerHTML = `
      <div class="erp-selected-card">
        <div class="erp-selected-top">
          <div class="erp-selected-product">
            <div class="erp-selected-label">
              ERP PRODUCT SELECTED
            </div>

            <div class="erp-selected-name">
              ${erpEsc(p.name || '-')}
            </div>

            <div class="erp-selected-code">
              Product Code:
              <strong>${erpEsc(p.code || '-')}</strong>
            </div>
          </div>

          <div class="erp-selected-stock ${cls}">
            <div class="erp-selected-stock-number">
              ${qty.toLocaleString()}
            </div>

            <div class="erp-selected-stock-caption">
              ${erpStockLabel(qty)}
            </div>
          </div>
        </div>

        <div class="erp-selected-grid">
          <div class="erp-selected-info">
            <span>ERP PRICE</span>
            <b>${erpEsc(price)}</b>
          </div>

          <div class="erp-selected-info">
            <span>CATEGORY</span>
            <b>${erpEsc(category)}</b>
          </div>

          <div class="erp-selected-info">
            <span>BRAND</span>
            <b>${erpEsc(brand)}</b>
          </div>
        </div>

        <div class="erp-selected-footer">
          <div>
            Live availability from
            <strong>ERP Branch ${ERP_BRANCH_ID}</strong>
          </div>

          <div>
            Checked ${erpEsc(checked)}
          </div>
        </div>
      </div>
    `;
  }

  async function erpLoadSuggestions(q){
    const seq = ++erpSearchSeq;

    erpSetStatus(
      'loading',
      `Searching ERP Branch ${ERP_BRANCH_ID}...`
    );

    const suggestionBox = document.getElementById('erpStockSuggestions');

    if(suggestionBox){
      suggestionBox.innerHTML = `
        <div class="erp-suggest-message">
          Searching ERP products...
        </div>
      `;

      suggestionBox.classList.add('show');
    }

    try{
      const rows = await erpProxySearch(q);

      if(seq !== erpSearchSeq){
        return;
      }

      erpRenderSuggestions(rows);

      if(rows.length){
        erpSetStatus(
          'ok',
          `${rows.length} matching ERP product${rows.length === 1 ? '' : 's'} found. Select one to view stock.`
        );
      }else{
        erpSetStatus(
          '',
          'No ERP product matched your search.'
        );
      }

    }catch(e){
      if(seq !== erpSearchSeq){
        return;
      }

      console.error('ERP stock lookup failed',e);

      if(suggestionBox){
        suggestionBox.innerHTML = `
          <div class="erp-suggest-message">
            ERP search could not be loaded.
          </div>
        `;

        suggestionBox.classList.add('show');
      }

      erpSetStatus(
        'error',
        e?.name === 'AbortError'
          ? 'ERP request timed out. Please try again.'
          : (e?.message || 'Could not contact ERP.')
      );
    }
  }

  window.erpStockTypeV112 = function(value){
    const q = String(value || '').trim();

    erpShowClear(q.length > 0);
    clearTimeout(erpSearchTimer);

    erpSelectedProduct = null;
    erpRenderSelected(null);

    if(q.length < 2){
      erpSearchSeq++;
      erpRows = [];
      erpHideSuggestions();

      erpSetStatus(
        '',
        'Type at least 2 characters to search ERP products.'
      );

      return;
    }

    erpSetStatus(
      'loading',
      'Waiting for product search...'
    );

    erpSearchTimer =
      setTimeout(
        ()=>{
          erpLoadSuggestions(q);
        },
        300
      );
  };

  window.erpStockFocusV112 = function(){
    const input = document.getElementById('erpStockSearch');

    if(
      input &&
      input.value.trim().length >= 2 &&
      erpRows.length
    ){
      const box = document.getElementById('erpStockSuggestions');
      if(box){
        box.classList.add('show');
      }
    }
  };

  window.selectERPStockProductV112 = function(index){
    const p = erpRows[index];
    if(!p) return;

    erpSelectedProduct = p;

    const input = document.getElementById('erpStockSearch');

    if(input){
      input.value = `${p.code || ''} — ${p.name || ''}`;
    }

    erpShowClear(true);
    erpHideSuggestions();
    erpRenderSelected(p);

    erpSetStatus(
      'ok',
      `Live stock loaded from ERP Branch ${ERP_BRANCH_ID}.`
    );
  };

  function erpRefreshActiveSuggestion(){
    const items = document.querySelectorAll(
      '#erpStockSuggestions .erp-suggestion-item'
    );

    items.forEach(
      (el,i)=>{
        el.classList.toggle(
          'active',
          i === erpActiveIndex
        );
      }
    );

    if(
      erpActiveIndex >= 0 &&
      items[erpActiveIndex]
    ){
      items[erpActiveIndex].scrollIntoView({
        block:'nearest'
      });
    }
  }

  window.erpStockKeyV112 = function(event){
    const box = document.getElementById('erpStockSuggestions');

    if(
      !box ||
      !box.classList.contains('show')
    ){
      return;
    }

    const count = Math.min(erpRows.length,10);
    if(!count) return;

    if(event.key === 'ArrowDown'){
      event.preventDefault();

      erpActiveIndex =
        erpActiveIndex < count - 1
          ? erpActiveIndex + 1
          : 0;

      erpRefreshActiveSuggestion();
      return;
    }

    if(event.key === 'ArrowUp'){
      event.preventDefault();

      erpActiveIndex =
        erpActiveIndex > 0
          ? erpActiveIndex - 1
          : count - 1;

      erpRefreshActiveSuggestion();
      return;
    }

    if(event.key === 'Enter'){
      if(erpActiveIndex >= 0){
        event.preventDefault();
        window.selectERPStockProductV112(erpActiveIndex);
      }else if(erpRows.length){
        event.preventDefault();
        window.selectERPStockProductV112(0);
      }

      return;
    }

    if(event.key === 'Escape'){
      erpHideSuggestions();
    }
  };

  window.clearERPStockV112 = function(){
    clearTimeout(erpSearchTimer);

    erpSearchSeq++;
    erpRows = [];
    erpActiveIndex = -1;
    erpSelectedProduct = null;

    const input = document.getElementById('erpStockSearch');
    const selected = document.getElementById('erpStockSelected');

    if(input){
      input.value = '';
      input.focus();
    }

    if(selected){
      selected.innerHTML = '';
    }

    erpShowClear(false);
    erpHideSuggestions();

    erpSetStatus(
      '',
      'Type at least 2 characters to search ERP products.'
    );
  };

  window.resetERPStockSearchV112 = function(){
    clearTimeout(erpSearchTimer);

    erpSearchSeq++;
    erpRows = [];
    erpActiveIndex = -1;
    erpSelectedProduct = null;

    const input = document.getElementById('erpStockSearch');
    const selected = document.getElementById('erpStockSelected');

    if(input){
      input.value = '';
    }

    if(selected){
      selected.innerHTML = '';
    }

    erpShowClear(false);
    erpHideSuggestions();

    erpSetStatus(
      '',
      'Type at least 2 characters to search ERP products.'
    );
  };

  document.addEventListener(
    'click',
    function(e){
      const wrap = document.querySelector('.erp-autocomplete-wrap');

      if(
        wrap &&
        !wrap.contains(e.target)
      ){
        erpHideSuggestions();
      }
    }
  );

  const openConvertBase = window.convertCurrentToPI;

  if(typeof openConvertBase === 'function'){
    window.convertCurrentToPI = function(){
      window.resetERPStockSearchV112();
      return openConvertBase.apply(this,arguments);
    };
  }

})();
/* =========================================================
   LABEL MASTER - ERP LIVE STOCK SEARCH
   ========================================================= */

(function(){

  const LM_ERP_URL =
    'https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-stock-search';

  const LM_ERP_BRANCH = 2;

  let lmTimer = null;
  let lmSeq = 0;
  let lmRows = [];
  let lmActive = -1;

  const lmCache = new Map();


  function lmEsc(v){
    return typeof esc === 'function'
      ? esc(String(v ?? ''))
      : String(v ?? '').replace(/[&<>"']/g,c=>({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        }[c]));
  }


  function lmMoney(v,currency='LKR'){

    const n = Number(v);

    return Number.isFinite(n)
      ? `${currency} ${n.toLocaleString(undefined,{
          minimumFractionDigits:2,
          maximumFractionDigits:2
        })}`
      : '-';
  }


  function lmStockClass(q){

    q = Number(q || 0);

    if(q <= 0) return 'out';
    if(q <= 5) return 'low';

    return 'ok';
  }


  function lmStockLabel(q){

    q = Number(q || 0);

    if(q <= 0) return 'OUT OF STOCK';
    if(q <= 5) return 'LOW STOCK';

    return 'IN STOCK';
  }


  function lmInitial(name){

    const txt =
      String(name || '').trim();

    if(!txt) return 'P';

    return txt
      .split(/\s+/)
      .slice(0,2)
      .map(x=>x.charAt(0))
      .join('')
      .toUpperCase();
  }


  function lmSupabaseKey(){

    const key =
      (
        localStorage.getItem(
          'spgs_supabase_browser_key_v1'
        ) || ''
      ).trim();

    if(!key){

      throw new Error(
        'Supabase browser key is not configured on this device.'
      );
    }

    return key;
  }


  async function lmERPRequest(q){

    const cacheKey =
      q.toLowerCase();

    if(lmCache.has(cacheKey)){
      return lmCache.get(cacheKey);
    }


    const key =
      lmSupabaseKey();

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        ()=>controller.abort(),
        12000
      );


    try{

      const res =
        await fetch(
          LM_ERP_URL,
          {
            method:'POST',

            headers:{
              'Content-Type':'application/json',
              'apikey':key,
              'Authorization':'Bearer ' + key
            },

            body:JSON.stringify({
              q:q,
              branch_id:LM_ERP_BRANCH
            }),

            signal:controller.signal
          }
        );


      let body = {};

      try{
        body = await res.json();
      }catch(e){}


      if(!res.ok){

        throw new Error(
          body?.error ||
          body?.message ||
          `ERP service returned ${res.status}`
        );
      }


      if(body?.success === false){

        throw new Error(
          body?.error ||
          body?.message ||
          'ERP search failed.'
        );
      }


      const rows =
        Array.isArray(body?.data)
          ? body.data
          : [];


      lmCache.set(
        cacheKey,
        rows
      );


      if(lmCache.size > 30){

        const first =
          lmCache.keys().next().value;

        lmCache.delete(first);
      }


      return rows;

    }finally{

      clearTimeout(timeout);

    }
  }


  function lmStatus(type,text){

    const el =
      document.getElementById(
        'lmErpStockStatus'
      );

    if(!el) return;


    el.className =
      'erp-lookup-status' +
      (type ? ' ' + type : '');


    el.innerHTML =
      `<span class="erp-status-dot"></span>${lmEsc(text)}`;
  }


  function lmShowClear(show){

    const btn =
      document.getElementById(
        'lmErpStockClear'
      );

    if(btn){
      btn.classList.toggle(
        'show',
        !!show
      );
    }
  }


  function lmHideSuggestions(){

    const box =
      document.getElementById(
        'lmErpStockSuggestions'
      );

    if(box){
      box.classList.remove('show');
    }

    lmActive = -1;
  }


  function lmRenderSuggestions(rows){

    const box =
      document.getElementById(
        'lmErpStockSuggestions'
      );

    if(!box) return;


    lmRows = rows || [];
    lmActive = -1;


    if(!lmRows.length){

      box.innerHTML = `
        <div class="erp-suggest-message">
          No ERP products found for this search.
        </div>
      `;

      box.classList.add('show');

      return;
    }


    box.innerHTML =
      lmRows
      .slice(0,10)
      .map((p,i)=>{

        const qty =
          Number(
            p.stock_quantity || 0
          );

        const cls =
          lmStockClass(qty);

        const meta =
          [
            p.category,
            p.brand
          ]
          .filter(Boolean)
          .join(' • ')
          ||
          'ERP Product';


        return `

          <button
            type="button"
            class="erp-suggestion-item"
            onclick="lmSelectERPProduct(${i})"
          >

            <div class="erp-suggestion-avatar">
              ${lmEsc(
                lmInitial(p.name)
              )}
            </div>


            <div class="erp-suggestion-main">

              <div class="erp-suggestion-code">
                ${lmEsc(
                  p.code || 'NO CODE'
                )}
              </div>


              <div class="erp-suggestion-name">
                ${lmEsc(
                  p.name || '-'
                )}
              </div>


              <div class="erp-suggestion-meta">
                ${lmEsc(meta)}
              </div>

            </div>


            <div class="erp-suggestion-right">

              <div class="erp-suggestion-price">

                ${lmEsc(
                  lmMoney(
                    p.price,
                    p.currency || 'LKR'
                  )
                )}

              </div>


              <div class="erp-suggestion-stock">

                <strong>
                  ${qty.toLocaleString()}
                </strong>

                <span class="erp-mini-stock ${cls}">
                  ${lmStockLabel(qty)}
                </span>

              </div>

            </div>

          </button>

        `;

      })
      .join('');


    box.classList.add('show');
  }


  function lmRenderSelected(p){

    const box =
      document.getElementById(
        'lmErpStockSelected'
      );

    if(!box) return;


    if(!p){

      box.innerHTML = '';

      return;
    }


    const qty =
      Number(
        p.stock_quantity || 0
      );

    const cls =
      lmStockClass(qty);


    const checked =
      new Date()
      .toLocaleTimeString(
        [],
        {
          hour:'2-digit',
          minute:'2-digit'
        }
      );


    box.innerHTML = `

      <div class="erp-selected-card">

        <div class="erp-selected-top">

          <div class="erp-selected-product">

            <div class="erp-selected-label">
              ERP PRODUCT SELECTED
            </div>


            <div class="erp-selected-name">
              ${lmEsc(
                p.name || '-'
              )}
            </div>


            <div class="erp-selected-code">

              Product Code:

              <strong>
                ${lmEsc(
                  p.code || '-'
                )}
              </strong>

            </div>

          </div>


          <div class="erp-selected-stock ${cls}">

            <div class="erp-selected-stock-number">
              ${qty.toLocaleString()}
            </div>

            <div class="erp-selected-stock-caption">
              ${lmStockLabel(qty)}
            </div>

          </div>

        </div>


        <div class="erp-selected-grid">

          <div class="erp-selected-info">

            <span>ERP PRICE</span>

            <b>
              ${lmEsc(
                lmMoney(
                  p.price,
                  p.currency || 'LKR'
                )
              )}
            </b>

          </div>


          <div class="erp-selected-info">

            <span>CATEGORY</span>

            <b>
              ${lmEsc(
                p.category || '-'
              )}
            </b>

          </div>


          <div class="erp-selected-info">

            <span>BRAND</span>

            <b>
              ${lmEsc(
                p.brand || '-'
              )}
            </b>

          </div>

        </div>


        <div class="erp-selected-footer">

          <div>
            Live availability from
            <strong>
              ERP Branch ${LM_ERP_BRANCH}
            </strong>
          </div>

          <div>
            Checked ${lmEsc(checked)}
          </div>

        </div>

      </div>

    `;
  }


  async function lmLoad(q){

    const seq =
      ++lmSeq;


    lmStatus(
      'loading',
      `Searching ERP Branch ${LM_ERP_BRANCH}...`
    );


    try{

      const rows =
        await lmERPRequest(q);


      if(seq !== lmSeq){
        return;
      }


      lmRenderSuggestions(rows);


      if(rows.length){

        lmStatus(
          'ok',
          `${rows.length} matching ERP product${rows.length === 1 ? '' : 's'} found. Select one to view stock.`
        );

      }else{

        lmStatus(
          '',
          'No ERP product matched your search.'
        );

      }


    }catch(e){

      if(seq !== lmSeq){
        return;
      }


      console.error(
        'Label Master ERP search failed',
        e
      );


      lmStatus(
        'error',
        e?.name === 'AbortError'
          ? 'ERP request timed out.'
          : (
              e?.message ||
              'Could not contact ERP.'
            )
      );
    }
  }


  window.lmErpStockType =
    function(value){

      const q =
        String(
          value || ''
        ).trim();


      clearTimeout(lmTimer);

      lmShowClear(
        q.length > 0
      );

      lmRenderSelected(null);


      if(q.length < 2){

        lmSeq++;
        lmRows = [];

        lmHideSuggestions();

        lmStatus(
          '',
          'Type at least 2 characters to search ERP products.'
        );

        return;
      }


      lmStatus(
        'loading',
        'Waiting for product search...'
      );


      lmTimer =
        setTimeout(
          ()=>lmLoad(q),
          600
        );
    };


  window.lmSelectERPProduct =
    function(index){

      const p =
        lmRows[index];

      if(!p) return;


      const input =
        document.getElementById(
          'lmErpStockSearch'
        );


      if(input){

        input.value =
          `${p.code || ''} — ${p.name || ''}`;

      }


      lmShowClear(true);

      lmHideSuggestions();

      lmRenderSelected(p);


      lmStatus(
        'ok',
        `Live stock loaded from ERP Branch ${LM_ERP_BRANCH}.`
      );
    };


  function lmRefreshActive(){

    const items =
      document.querySelectorAll(
        '#lmErpStockSuggestions .erp-suggestion-item'
      );


    items.forEach(
      (el,i)=>{
        el.classList.toggle(
          'active',
          i === lmActive
        );
      }
    );


    if(
      lmActive >= 0 &&
      items[lmActive]
    ){

      items[lmActive]
      .scrollIntoView({
        block:'nearest'
      });

    }
  }


  window.lmErpStockKey =
    function(event){

      const box =
        document.getElementById(
          'lmErpStockSuggestions'
        );


      if(
        !box ||
        !box.classList.contains('show')
      ){
        return;
      }


      const count =
        Math.min(
          lmRows.length,
          10
        );


      if(!count) return;


      if(event.key === 'ArrowDown'){

        event.preventDefault();

        lmActive =
          lmActive < count - 1
            ? lmActive + 1
            : 0;

        lmRefreshActive();

      }else if(event.key === 'ArrowUp'){

        event.preventDefault();

        lmActive =
          lmActive > 0
            ? lmActive - 1
            : count - 1;

        lmRefreshActive();

      }else if(event.key === 'Enter'){

        event.preventDefault();

        window.lmSelectERPProduct(
          lmActive >= 0
            ? lmActive
            : 0
        );

      }else if(event.key === 'Escape'){

        lmHideSuggestions();

      }
    };


  window.lmErpStockFocus =
    function(){

      const input =
        document.getElementById(
          'lmErpStockSearch'
        );


      if(
        input &&
        input.value.trim().length >= 2 &&
        lmRows.length
      ){

        document
          .getElementById(
            'lmErpStockSuggestions'
          )
          ?.classList
          .add('show');

      }
    };


  window.lmClearERPStock =
    function(){

      clearTimeout(lmTimer);

      lmSeq++;
      lmRows = [];
      lmActive = -1;


      const input =
        document.getElementById(
          'lmErpStockSearch'
        );


      if(input){

        input.value = '';

        input.focus();

      }


      lmRenderSelected(null);

      lmShowClear(false);

      lmHideSuggestions();


      lmStatus(
        '',
        'Type at least 2 characters to search ERP products.'
      );
    };


  document.addEventListener(
    'click',
    function(e){

      const wrap =
        document.getElementById(
          'lmErpWrap'
        );


      if(
        wrap &&
        !wrap.contains(e.target)
      ){

        lmHideSuggestions();

      }
    }
  );

})();
/* =========================================================
   NEW QUOTATION - ERP LIVE STOCK SEARCH
   ========================================================= */

(function(){

  const QUOTE_ERP_URL =
    'https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-stock-search';

  const QUOTE_ERP_BRANCH = 2;

  let quoteErpTimer = null;
  let quoteErpSeq = 0;

  let quoteErpRows = [];
  let quoteErpActive = -1;

  const quoteErpCache = new Map();


  function qeEsc(v){

    if(typeof esc === 'function'){
      return esc(String(v ?? ''));
    }

    return String(v ?? '')
      .replace(
        /[&<>"']/g,
        c=>({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        }[c])
      );

  }


  function qeMoney(
    value,
    currency='LKR'
  ){

    const n =
      Number(value);

    if(!Number.isFinite(n)){
      return '-';
    }

    return (
      currency +
      ' ' +
      n.toLocaleString(
        undefined,
        {
          minimumFractionDigits:2,
          maximumFractionDigits:2
        }
      )
    );

  }


  function qeStockClass(qty){

    qty =
      Number(qty || 0);

    if(qty <= 0){
      return 'out';
    }

    if(qty <= 5){
      return 'low';
    }

    return 'ok';

  }


  function qeStockLabel(qty){

    qty =
      Number(qty || 0);

    if(qty <= 0){
      return 'OUT OF STOCK';
    }

    if(qty <= 5){
      return 'LOW STOCK';
    }

    return 'IN STOCK';

  }


  function qeInitial(name){

    const text =
      String(name || '').trim();

    if(!text){
      return 'P';
    }

    return text
      .split(/\s+/)
      .slice(0,2)
      .map(x=>x.charAt(0))
      .join('')
      .toUpperCase();

  }


  function qeBrowserKey(){

    const key =
      (
        localStorage.getItem(
          'spgs_supabase_browser_key_v1'
        ) || ''
      ).trim();


    if(!key){

      throw new Error(
        'Supabase browser key is not configured on this device.'
      );

    }

    return key;

  }


  async function qeSearch(q){

    const cacheKey =
      q.toLowerCase();


    if(
      quoteErpCache.has(
        cacheKey
      )
    ){

      return quoteErpCache.get(
        cacheKey
      );

    }


    const key =
      qeBrowserKey();


    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        ()=>controller.abort(),
        12000
      );


    try{

      const res =
        await fetch(
          QUOTE_ERP_URL,
          {

            method:'POST',

            headers:{
              'Content-Type':'application/json',
              'apikey':key,
              'Authorization':'Bearer ' + key
            },

            body:JSON.stringify({
              q:q,
              branch_id:QUOTE_ERP_BRANCH
            }),

            signal:
              controller.signal

          }
        );


      let body = {};

      try{

        body =
          await res.json();

      }catch(e){}


      if(!res.ok){

        throw new Error(
          body?.error ||
          body?.message ||
          `ERP returned HTTP ${res.status}`
        );

      }


      if(body?.success === false){

        throw new Error(
          body?.error ||
          body?.message ||
          'ERP search failed.'
        );

      }


      const rows =
        Array.isArray(body?.data)
          ? body.data
          : [];


      quoteErpCache.set(
        cacheKey,
        rows
      );


      if(
        quoteErpCache.size > 30
      ){

        const first =
          quoteErpCache
          .keys()
          .next()
          .value;

        quoteErpCache.delete(
          first
        );

      }


      return rows;

    }finally{

      clearTimeout(timeout);

    }

  }


  function qeStatus(
    type,
    text
  ){

    const el =
      document.getElementById(
        'quoteErpStockStatus'
      );

    if(!el){
      return;
    }


    el.className =
      'erp-lookup-status' +
      (
        type
          ? ' ' + type
          : ''
      );


    el.innerHTML =
      '<span class="erp-status-dot"></span>' +
      qeEsc(text);

  }


  function qeShowClear(show){

    const btn =
      document.getElementById(
        'quoteErpStockClear'
      );

    if(btn){

      btn.classList.toggle(
        'show',
        !!show
      );

    }

  }


  function qeHideSuggestions(){

    const box =
      document.getElementById(
        'quoteErpStockSuggestions'
      );

    if(box){

      box.classList.remove(
        'show'
      );

    }

    quoteErpActive = -1;

  }


  function qeRenderSuggestions(
    rows
  ){

    const box =
      document.getElementById(
        'quoteErpStockSuggestions'
      );

    if(!box){
      return;
    }


    quoteErpRows =
      rows || [];

    quoteErpActive = -1;


    if(
      !quoteErpRows.length
    ){

      box.innerHTML = `
        <div class="erp-suggest-message">
          No ERP products found.
        </div>
      `;

      box.classList.add(
        'show'
      );

      return;

    }


    box.innerHTML =
      quoteErpRows
      .slice(0,10)
      .map(
        (p,index)=>{

          const qty =
            Number(
              p.stock_quantity || 0
            );


          const cls =
            qeStockClass(qty);


          const meta =
            [
              p.category,
              p.brand
            ]
            .filter(Boolean)
            .join(' • ')
            ||
            'ERP Product';


          return `

            <button
              type="button"
              class="erp-suggestion-item"
              onclick="quoteSelectERPProduct(${index})"
            >

              <div class="erp-suggestion-avatar">
                ${qeEsc(
                  qeInitial(p.name)
                )}
              </div>


              <div class="erp-suggestion-main">

                <div class="erp-suggestion-code">
                  ${qeEsc(
                    p.code ||
                    'NO CODE'
                  )}
                </div>


                <div class="erp-suggestion-name">
                  ${qeEsc(
                    p.name || '-'
                  )}
                </div>


                <div class="erp-suggestion-meta">
                  ${qeEsc(meta)}
                </div>

              </div>


              <div class="erp-suggestion-right">

                <div class="erp-suggestion-price">

                  ${qeEsc(
                    qeMoney(
                      p.price,
                      p.currency || 'LKR'
                    )
                  )}

                </div>


                <div class="erp-suggestion-stock">

                  <strong>
                    ${qty.toLocaleString()}
                  </strong>

                  <span
                    class="erp-mini-stock ${cls}"
                  >
                    ${qeStockLabel(qty)}
                  </span>

                </div>

              </div>

            </button>

          `;

        }
      )
      .join('');


    box.classList.add(
      'show'
    );

  }


  function qeRenderSelected(p){

    const box =
      document.getElementById(
        'quoteErpStockSelected'
      );

    if(!box){
      return;
    }


    if(!p){

      box.innerHTML = '';

      return;

    }


    const qty =
      Number(
        p.stock_quantity || 0
      );


    const cls =
      qeStockClass(qty);


    const checked =
      new Date()
      .toLocaleTimeString(
        [],
        {
          hour:'2-digit',
          minute:'2-digit'
        }
      );


    box.innerHTML = `

      <div class="erp-selected-card">


        <div class="erp-selected-top">


          <div class="erp-selected-product">

            <div class="erp-selected-label">
              ERP PRODUCT SELECTED
            </div>


            <div class="erp-selected-name">
              ${qeEsc(
                p.name || '-'
              )}
            </div>


            <div class="erp-selected-code">

              Product Code:

              <strong>
                ${qeEsc(
                  p.code || '-'
                )}
              </strong>

            </div>

          </div>


          <div
            class="erp-selected-stock ${cls}"
          >

            <div class="erp-selected-stock-number">
              ${qty.toLocaleString()}
            </div>

            <div class="erp-selected-stock-caption">
              ${qeStockLabel(qty)}
            </div>

          </div>

        </div>


        <div class="erp-selected-grid">


          <div class="erp-selected-info">

            <span>
              ERP PRICE
            </span>

            <b>
              ${qeEsc(
                qeMoney(
                  p.price,
                  p.currency || 'LKR'
                )
              )}
            </b>

          </div>


          <div class="erp-selected-info">

            <span>
              CATEGORY
            </span>

            <b>
              ${qeEsc(
                p.category || '-'
              )}
            </b>

          </div>


          <div class="erp-selected-info">

            <span>
              BRAND
            </span>

            <b>
              ${qeEsc(
                p.brand || '-'
              )}
            </b>

          </div>


        </div>


        <div class="erp-selected-footer">

          <div>

            Live availability from

            <strong>
              ERP Branch ${QUOTE_ERP_BRANCH}
            </strong>

          </div>


          <div>
            Checked ${qeEsc(checked)}
          </div>

        </div>


      </div>

    `;

  }


  async function qeLoad(q){

    const seq =
      ++quoteErpSeq;


    qeStatus(
      'loading',
      `Searching ERP Branch ${QUOTE_ERP_BRANCH}...`
    );


    try{

      const rows =
        await qeSearch(q);


      if(
        seq !== quoteErpSeq
      ){
        return;
      }


      qeRenderSuggestions(
        rows
      );


      if(rows.length){

        qeStatus(
          'ok',
          `${rows.length} matching ERP product${rows.length === 1 ? '' : 's'} found. Select one to view stock.`
        );

      }else{

        qeStatus(
          '',
          'No ERP product matched your search.'
        );

      }


    }catch(error){

      if(
        seq !== quoteErpSeq
      ){
        return;
      }


      console.error(
        'Quotation ERP stock search failed',
        error
      );


      qeStatus(
        'error',

        error?.name === 'AbortError'

          ? 'ERP request timed out.'

          : (
              error?.message ||
              'Could not contact ERP.'
            )
      );

    }

  }


  window.quoteErpStockType =
    function(value){

      const q =
        String(
          value || ''
        ).trim();


      clearTimeout(
        quoteErpTimer
      );


      qeShowClear(
        q.length > 0
      );


      qeRenderSelected(
        null
      );


      if(
        q.length < 2
      ){

        quoteErpSeq++;

        quoteErpRows = [];

        qeHideSuggestions();


        qeStatus(
          '',
          'Type at least 2 characters to search ERP products.'
        );

        return;

      }


      qeStatus(
        'loading',
        'Waiting for product search...'
      );


      /*
       * Slightly longer debounce because the ERP API
       * has a request-rate limit.
       */
      quoteErpTimer =
        setTimeout(
          ()=>qeLoad(q),
          900
        );

    };


  window.quoteSelectERPProduct =
    function(index){

      const p =
        quoteErpRows[index];

      if(!p){
        return;
      }


      const input =
        document.getElementById(
          'quoteErpStockSearch'
        );


      if(input){

        input.value =
          `${p.code || ''} — ${p.name || ''}`;

      }


      qeShowClear(true);

      qeHideSuggestions();

      qeRenderSelected(p);


      qeStatus(
        'ok',
        `Live stock loaded from ERP Branch ${QUOTE_ERP_BRANCH}.`
      );

    };


  function qeRefreshActive(){

    const items =
      document.querySelectorAll(
        '#quoteErpStockSuggestions .erp-suggestion-item'
      );


    items.forEach(
      (el,index)=>{

        el.classList.toggle(
          'active',
          index === quoteErpActive
        );

      }
    );


    if(
      quoteErpActive >= 0 &&
      items[quoteErpActive]
    ){

      items[
        quoteErpActive
      ].scrollIntoView({
        block:'nearest'
      });

    }

  }


  window.quoteErpStockKey =
    function(event){

      const box =
        document.getElementById(
          'quoteErpStockSuggestions'
        );


      if(
        !box ||
        !box.classList.contains('show')
      ){

        return;

      }


      const count =
        Math.min(
          quoteErpRows.length,
          10
        );


      if(!count){
        return;
      }


      if(
        event.key === 'ArrowDown'
      ){

        event.preventDefault();


        quoteErpActive =
          quoteErpActive < count - 1

            ? quoteErpActive + 1

            : 0;


        qeRefreshActive();

      }

      else if(
        event.key === 'ArrowUp'
      ){

        event.preventDefault();


        quoteErpActive =
          quoteErpActive > 0

            ? quoteErpActive - 1

            : count - 1;


        qeRefreshActive();

      }

      else if(
        event.key === 'Enter'
      ){

        event.preventDefault();


        window.quoteSelectERPProduct(

          quoteErpActive >= 0

            ? quoteErpActive

            : 0

        );

      }

      else if(
        event.key === 'Escape'
      ){

        qeHideSuggestions();

      }

    };


  window.quoteErpStockFocus =
    function(){

      const input =
        document.getElementById(
          'quoteErpStockSearch'
        );


      if(
        input &&
        input.value.trim().length >= 2 &&
        quoteErpRows.length
      ){

        document
          .getElementById(
            'quoteErpStockSuggestions'
          )
          ?.classList
          .add('show');

      }

    };


  window.quoteClearERPStock =
    function(){

      clearTimeout(
        quoteErpTimer
      );


      quoteErpSeq++;

      quoteErpRows = [];

      quoteErpActive = -1;


      const input =
        document.getElementById(
          'quoteErpStockSearch'
        );


      if(input){

        input.value = '';

        input.focus();

      }


      qeRenderSelected(null);

      qeShowClear(false);

      qeHideSuggestions();


      qeStatus(
        '',
        'Type at least 2 characters to search ERP products.'
      );

    };


  document.addEventListener(
    'click',
    function(event){

      const wrap =
        document.getElementById(
          'quoteErpWrap'
        );


      if(
        wrap &&
        !wrap.contains(
          event.target
        )
      ){

        qeHideSuggestions();

      }

    }
  );

})();
/* =========================================================
   CUSTOMER CREDIT LIMIT CONTROL
   Prevent quotation -> PI when credit exposure exceeds limit
   ========================================================= */

(function(){

  function sameCreditCustomerV1016(doc,customer){

    if(!doc || !customer){
      return false;
    }

    /* Best match: customer ID */
    if(
      doc.customerId &&
      doc.customerId === customer.id
    ){
      return true;
    }

    /* Legacy document fallback */
    if(
      customer.phone &&
      doc.customer?.phone &&
      customer.phone === doc.customer.phone
    ){
      return true;
    }

    if(
      customer.name &&
      doc.customer?.name &&
      customer.name.trim().toLowerCase() ===
      doc.customer.name.trim().toLowerCase()
    ){
      return true;
    }

    return false;
  }


  function customerCreditOutstandingV1016(customer){

    return (state.docs || [])
      .filter(d=>

        d.type === 'PI' &&

        /* Only credit transactions consume credit limit */
        (d.payMode || 'credit') === 'credit' &&

        /* Ignore replaced/closed duplicate document if any */
        !d.replacedBy &&

        sameCreditCustomerV1016(
          d,
          customer
        )

      )
      .reduce((total,d)=>{

        /*
         * Use your existing PI payment ledger.
         * Paid PI = 0 balance
         * Part paid PI = remaining balance
         * Unpaid PI = full PI amount
         */

        if(
          typeof paymentSummary === 'function'
        ){

          return (
            total +
            Number(
              paymentSummary(d).balance || 0
            )
          );

        }


        /* Safety fallback */

        const gross =
          typeof docTotals === 'function'
            ? Number(docTotals(d).gross || 0)
            : (d.lines || []).reduce(
                (s,l)=>
                  s +
                  Number(l.qty || 0) *
                  Number(l.price || 0),
                0
              );


        const paid =
          (d.paymentHistory || [])
          .filter(p=>!p.invalid)
          .reduce(
            (s,p)=>
              s +
              Number(p.amount || 0),
            0
          );


        return (
          total +
          Math.max(
            0,
            gross - paid
          )
        );

      },0);

  }


  function selectedPIAmountV1016(q){

    const selected =
      [
        ...document.querySelectorAll(
          '.convcheck:checked'
        )
      ]
      .map(
        x=>Number(x.dataset.i)
      );


    return selected.reduce(
      (total,index)=>{

        const line =
          q.lines?.[index];

        if(!line){
          return total;
        }

        return (
          total +
          Number(line.qty || 0) *
          Number(line.price || 0)
        );

      },
      0
    );

  }


  function checkCustomerCreditForPIV1016(){

    const q =
      typeof collectCurrent === 'function'
        ? collectCurrent()
        : null;


    if(
      !q ||
      q.type !== 'Q'
    ){

      return true;

    }


    const customer =
      state.customers.find(
        c=>c.id === q.customerId
      );


    if(!customer){

      return true;

    }


    /* Cash customers do not use credit limit */

    if(
      customer.paymentMode !== 'credit'
    ){

      return true;

    }


    const creditLimit =
      Math.max(
        0,
        Number(
          customer.creditLimit || 0
        )
      );


    const currentOutstanding =
      customerCreditOutstandingV1016(
        customer
      );


    const newPIAmount =
      selectedPIAmountV1016(q);


    const projectedOutstanding =
      currentOutstanding +
      newPIAmount;


    const overAmount =
      projectedOutstanding -
      creditLimit;


    if(
      projectedOutstanding <=
      creditLimit + 0.01
    ){

      return true;

    }


    const msg =
`PI CREATION BLOCKED — CREDIT LIMIT EXCEEDED

Customer:
${customer.name || 'Selected Customer'}

Credit Limit:
LKR ${money(creditLimit)}

Current Outstanding:
LKR ${money(currentOutstanding)}

This PI Value:
LKR ${money(newPIAmount)}

Projected Outstanding:
LKR ${money(projectedOutstanding)}

Over Credit Limit By:
LKR ${money(Math.max(0,overAmount))}

Please record customer payments or increase the customer's approved credit limit before creating this PI.`;


    console.warn(
      'Customer credit limit exceeded',
      {
        customer:customer.name,
        creditLimit,
        currentOutstanding,
        newPIAmount,
        projectedOutstanding,
        overAmount
      }
    );


    /* Short system feedback */

    if(
      typeof toast === 'function'
    ){

      toast(
        `PI blocked — ${customer.name} exceeds credit limit by LKR ${money(Math.max(0,overAmount))}`
      );

    }


    /*
     * Full feedback message.
     * This keeps the user from missing the reason.
     */

    alert(msg);


    return false;

  }


  /*
   * Preserve ALL existing PI logic:
   * permissions
   * ERP stock
   * selected items
   * production planning
   * production requests
   * quotation -> PI linking
   */

  const createPIBaseV1016 =
    window.createPIFromSelection;


  window.createPIFromSelection =
    function(){

      if(
        !checkCustomerCreditForPIV1016()
      ){

        return false;

      }


      return createPIBaseV1016
        .apply(
          this,
          arguments
        );

    };


})();
/* =========================================================
   SOFTCREATION LIGHT / DARK THEME
   ========================================================= */

const SOFTCREATION_THEME_KEY =
  'softcreation_theme_v1';


function getAppTheme(){

  return (
    document.documentElement
      .getAttribute('data-theme') ||
    'light'
  );

}


function updateThemeToggle(){

  const btn =
    document.getElementById(
      'themeToggle'
    );

  if(!btn){
    return;
  }


  const dark =
    getAppTheme() === 'dark';


  btn.setAttribute(
    'aria-pressed',
    dark ? 'true' : 'false'
  );


  btn.setAttribute(
    'aria-label',
    dark
      ? 'Switch to light mode'
      : 'Switch to dark mode'
  );


  btn.title =
    dark
      ? 'Switch to light mode'
      : 'Switch to dark mode';

}


function applyAppTheme(
  theme,
  save=true
){

  const mode =
    theme === 'dark'
      ? 'dark'
      : 'light';


  document.documentElement
    .setAttribute(
      'data-theme',
      mode
    );


  document.documentElement.style.colorScheme =
    mode;


  if(save){

    try{

      localStorage.setItem(
        SOFTCREATION_THEME_KEY,
        mode
      );

    }catch(e){}

  }


  updateThemeToggle();

}


function toggleAppTheme(){

  const next =
    getAppTheme() === 'dark'
      ? 'light'
      : 'dark';


  applyAppTheme(
    next,
    true
  );

}


if(
  document.readyState === 'loading'
){

  document.addEventListener(
    'DOMContentLoaded',
    updateThemeToggle
  );

}else{

  updateThemeToggle();

}


/* Sync another browser tab if open */

window.addEventListener(
  'storage',
  function(e){

    if(
      e.key ===
      SOFTCREATION_THEME_KEY
    ){

      applyAppTheme(
        e.newValue || 'light',
        false
      );

    }

  }
);
window.toggleBpSeparateDeliveryButton = function(){

  const checkbox =
    document.getElementById('bpSeparateDelivery');

  const button =
    document.getElementById('bpSeparateDeliveryToggle');

  const fields =
    document.getElementById('bpSeparateDeliveryFields');


  if(!checkbox){
    console.error('bpSeparateDelivery not found');
    return;
  }


  /* Toggle ON / OFF */
  checkbox.checked =
    !checkbox.checked;


  const enabled =
    checkbox.checked;


  /* Update button state */
  if(button){

    button.setAttribute(
      'aria-pressed',
      enabled ? 'true' : 'false'
    );

  }


  /* Show / hide delivery fields */
  if(fields){

    fields.hidden =
      !enabled;

  }


  /* Required only when separate delivery is ON */
[
  'bpDeliveryCustomerName',
  'bpDeliveryLine1',
  'bpDeliveryLine2',
  'bpDeliveryContact1'
].forEach(function(id){

    const el =
      document.getElementById(id);

    if(el){

      el.required =
        enabled;

    }

  });

};
