/* =====================================================================
   SoftCreation SPGS <-> RouteX ERP (Translanka Nexus) Bridge
   Connects SPGS Manual Invoice directly to RouteX Translanka ERP Database.
   Reference App: RouteX (RouteX-App-Local - READ ONLY, NOT MODIFIED)
   ===================================================================== */
(function(window){
  'use strict';

  const ROUTEX_CONFIG = {
    supabaseUrl: 'https://pazppuiclbnfuzjkrmwg.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhenBwdWljbGJuZnV6amtybXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzU1MDQsImV4cCI6MjA4MTk1MTUwNH0.Zv7vzFsUgPgdyq6OAmI8ilrpZIiButjwZzw5fGC9bso',
    authEmail: 'soffice@gmail.com',
    authPassword: '22222222',
    translankaCompanyId: 'ab22b230-a2ff-4fa8-baa6-f5203410c6eb',
    translankaCompanyName: 'Translanka Nexus Pvt Ltd',
    translankaLorryId: '97b04d9d-4042-40e4-afb0-fdc0bf6d2fd0', // trcashier01
    lorryCode: '97B0',
    brylixUrl: 'https://softcreation.lk/api/v1',
    brylixKey: 'TEqihZqgTz+qpSzqtsbhcT1aS/bEXlSSyCUDc+HcgIY=',
    tokenStorageKey: 'spgs_routex_translanka_token_v1'
  };

  let cachedAuth = null;

  function generateUUID(){
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async function getAuthSession(forceRefresh = false){
    if (!forceRefresh && cachedAuth && cachedAuth.expiresAt > Date.now() + 60000) {
      return cachedAuth;
    }

    if (!forceRefresh) {
      try {
        const stored = localStorage.getItem(ROUTEX_CONFIG.tokenStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.expiresAt > Date.now() + 60000 && parsed.token) {
            cachedAuth = parsed;
            return cachedAuth;
          }
        }
      } catch (err) {
        console.warn('Error reading RouteX token from storage:', err);
      }
    }

    try {
      const res = await fetch(`${ROUTEX_CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': ROUTEX_CONFIG.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: ROUTEX_CONFIG.authEmail,
          password: ROUTEX_CONFIG.authPassword
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`RouteX Auth Error (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      const token = data.access_token;
      const userId = data.user?.id || '455efaf9-4c2c-40e4-8d0d-22017b5fa525';
      const expiresIn = Number(data.expires_in || 3600);
      const expiresAt = Date.now() + (expiresIn * 1000);

      cachedAuth = {
        token,
        userId,
        expiresAt,
        user: data.user
      };

      try {
        localStorage.setItem(ROUTEX_CONFIG.tokenStorageKey, JSON.stringify(cachedAuth));
      } catch (e) {
        console.warn('Could not cache RouteX token to localStorage:', e);
      }

      return cachedAuth;
    } catch (error) {
      console.error('RouteX Authentication failed:', error);
      throw error;
    }
  }

  async function apiFetch(path, options = {}, retryOn401 = true){
    const auth = await getAuthSession();
    const headers = {
      'apikey': ROUTEX_CONFIG.anonKey,
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(`${ROUTEX_CONFIG.supabaseUrl}/rest/v1${path}`, {
      ...options,
      headers
    });

    if (res.status === 401 && retryOn401) {
      console.warn('RouteX token returned 401 Unauthorized, refreshing token...');
      await getAuthSession(true);
      return apiFetch(path, options, false);
    }

    if (!res.ok) {
      const errText = await res.text();
      let errJson = null;
      try { errJson = JSON.parse(errText); } catch (_) {}
      const msg = errJson?.message || errJson?.details || errText || `HTTP ${res.status}`;
      throw new Error(`RouteX DB Error (${res.status}): ${msg}`);
    }

    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const RouteXLink = {
    config: ROUTEX_CONFIG,

    async isConnected(){
      try {
        const auth = await getAuthSession();
        return { ok: true, userId: auth.userId, email: ROUTEX_CONFIG.authEmail };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    async searchCustomers(query = ''){
      const q = String(query || '').trim();
      let path = `/routex_customers?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&select=id,name,phone,address,created_at&order=name.asc&limit=30`;
      if (q) {
        const encoded = encodeURIComponent(q);
        path += `&or=(name.ilike.*${encoded}*,phone.ilike.*${encoded}*,address.ilike.*${encoded}*)`;
      }
      try {
        const rows = await apiFetch(path);
        return (rows || []).map(c => ({
          id: c.id,
          code: c.id.slice(0, 8).toUpperCase(),
          name: c.name || '',
          phone: c.phone || '',
          email: '',
          tin: '',
          address: c.address || '',
          source: 'routex'
        }));
      } catch (err) {
        console.error('RouteX searchCustomers failed:', err);
        return [];
      }
    },

    async getOrCreateCustomer({ name, phone = '', address = '' }){
      const trimmedName = String(name || '').trim();
      if (!trimmedName) throw new Error('Customer name is required for RouteX synchronization.');

      // Check if already exists by exact name in Translanka
      const existing = await apiFetch(
        `/routex_customers?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&name=eq.${encodeURIComponent(trimmedName)}&limit=1`
      );

      if (existing && existing.length > 0) {
        return existing[0];
      }

      // Create new customer in RouteX
      const auth = await getAuthSession();
      const newCustId = generateUUID();
      const newRow = {
        id: newCustId,
        company_id: ROUTEX_CONFIG.translankaCompanyId,
        assigned_lorry_id: ROUTEX_CONFIG.translankaLorryId,
        created_by_user_id: auth.userId,
        name: trimmedName,
        phone: String(phone || '').trim() || null,
        address: String(address || '').trim() || null
      };

      const created = await apiFetch('/routex_customers', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(newRow)
      });

      return Array.isArray(created) ? created[0] : (created || newRow);
    },

    async searchBrylixCustomers(query = ''){
      const q = String(query || '').trim();
      if (q.length < 2) return [];

      try {
        const url = `${ROUTEX_CONFIG.brylixUrl}/customers?search=${encodeURIComponent(q)}&per_page=15&page=1`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': ROUTEX_CONFIG.brylixKey
          }
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            return json.data.map(c => {
              const phone = c.phone || c.mobile || c.contact_number || '';
              return {
                id: `brylix-${c.id}`,
                brylixId: c.id,
                code: c.code || `BX-${c.id}`,
                name: c.name || 'Unnamed ERP Customer',
                phone: phone,
                email: c.email || '',
                tin: '',
                address: c.address || '',
                source: 'brylix',
                brylixData: c
              };
            });
          }
        }
      } catch (err) {
        console.warn('Direct Brylix API call warning:', err);
      }

      // Fallback: query via SPGS Edge Function if available
      try {
        const key = String(localStorage.getItem('spgs_supabase_browser_key_v1') || window.SPGS_SUPABASE_ANON_KEY || '').trim();
        if (key) {
          const edgeRes = await fetch('https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-customer-search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + key
            },
            body: JSON.stringify({ action: 'search', q, limit: 15 })
          });
          if (edgeRes.ok) {
            const edgeData = await edgeRes.json();
            if (edgeData.ok && Array.isArray(edgeData.customers)) {
              return edgeData.customers.map(c => ({
                id: `brylix-${c.id}`,
                brylixId: c.id,
                code: c.code || `BX-${c.id}`,
                name: c.name || '',
                phone: c.phone || '',
                email: c.email || '',
                tin: c.tin || '',
                address: c.address || '',
                source: 'brylix',
                brylixData: c
              }));
            }
          }
        }
      } catch (edgeErr) {
        console.warn('SPGS Edge fallback warning for Brylix search:', edgeErr);
      }

      return [];
    },

    async searchCombinedCustomers(query = ''){
      const q = String(query || '').trim();
      if (!q) {
        return await this.searchCustomers('');
      }

      const [rxCustomers, bxCustomers] = await Promise.allSettled([
        this.searchCustomers(q),
        this.searchBrylixCustomers(q)
      ]);

      const localList = rxCustomers.status === 'fulfilled' ? rxCustomers.value : [];
      const brylixList = bxCustomers.status === 'fulfilled' ? bxCustomers.value : [];

      const norm = str => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const existingPhones = new Set(localList.map(c => norm(c.phone)).filter(Boolean));
      const existingNames = new Set(localList.map(c => norm(c.name)).filter(Boolean));

      const filteredBrylix = brylixList.filter(bx => {
        const p = norm(bx.phone);
        const n = norm(bx.name);
        if (p && existingPhones.has(p)) return false;
        if (n && existingNames.has(n)) return false;
        return true;
      });

      return [...localList, ...filteredBrylix];
    },

    async ensureBrylixCustomerInRouteX(brylixCust){
      const cleanName = String(brylixCust.name || '').trim();
      if (!cleanName) throw new Error('Brylix customer name is required.');

      const cleanPhone = String(brylixCust.phone || '').trim();
      let cleanAddress = String(brylixCust.address || '').trim();

      // If address is blank and brylixId exists, fetch address from SPGS erp-customer-search Edge Function
      if (!cleanAddress && brylixCust.brylixId) {
        try {
          const key = String(localStorage.getItem('spgs_supabase_browser_key_v1') || window.SPGS_SUPABASE_ANON_KEY || '').trim();
          if (key) {
            const addrRes = await fetch('https://qyxgamverzdmhtvezbft.supabase.co/functions/v1/erp-customer-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
              body: JSON.stringify({ action: 'addresses', customer_id: brylixCust.brylixId })
            });
            if (addrRes.ok) {
              const addrData = await addrRes.json();
              if (addrData.ok && Array.isArray(addrData.addresses) && addrData.addresses.length > 0) {
                cleanAddress = addrData.addresses.map(a => a.address).filter(Boolean).join(', ').trim();
              }
            }
          }
        } catch (addrErr) {
          console.warn('Could not fetch address for Brylix customer:', addrErr);
        }
      }

      // 1. Try to find existing customer by phone in RouteX
      if (cleanPhone) {
        const byPhone = await apiFetch(
          `/routex_customers?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&phone=eq.${encodeURIComponent(cleanPhone)}&limit=1`
        );
        if (byPhone && byPhone.length > 0) {
          return {
            id: byPhone[0].id,
            name: byPhone[0].name,
            phone: byPhone[0].phone || cleanPhone,
            address: byPhone[0].address || cleanAddress,
            isExisting: true
          };
        }
      }

      // 2. Try to find existing customer by exact name in RouteX
      const byName = await apiFetch(
        `/routex_customers?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&name=eq.${encodeURIComponent(cleanName)}&limit=1`
      );
      if (byName && byName.length > 0) {
        return {
          id: byName[0].id,
          name: byName[0].name,
          phone: byName[0].phone || cleanPhone,
          address: byName[0].address || cleanAddress,
          isExisting: true
        };
      }

      // 3. Insert into routex_customers
      const auth = await getAuthSession();
      const newCustId = generateUUID();
      const newRow = {
        id: newCustId,
        company_id: ROUTEX_CONFIG.translankaCompanyId,
        assigned_lorry_id: ROUTEX_CONFIG.translankaLorryId,
        created_by_user_id: auth.userId,
        name: cleanName,
        phone: cleanPhone || null,
        address: cleanAddress || null
      };

      const created = await apiFetch('/routex_customers', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(newRow)
      });

      const resObj = Array.isArray(created) ? created[0] : (created || newRow);
      return {
        id: resObj.id,
        name: resObj.name,
        phone: resObj.phone || cleanPhone,
        address: resObj.address || cleanAddress,
        isExisting: false
      };
    },

    async searchProducts(query = '', limit = 500){
      const q = String(query || '').trim();
      let path = `/routex_products?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&active=eq.true&select=id,name,barcode,stock,default_price&order=name.asc&limit=${limit}`;
      if (q) {
        const encoded = encodeURIComponent(q);
        path += `&or=(name.ilike.*${encoded}*,barcode.ilike.*${encoded}*)`;
      }

      try {
        const [products, inventory] = await Promise.all([
          apiFetch(path),
          apiFetch(`/routex_lorry_inventory?lorry_id=eq.${ROUTEX_CONFIG.translankaLorryId}&active=eq.true&select=product_id,remaining_quantity`)
        ]);

        const stockMap = new Map();
        (inventory || []).forEach(inv => {
          if (inv.product_id) {
            stockMap.set(inv.product_id, Number(inv.remaining_quantity || 0));
          }
        });

        return (products || []).map(p => ({
          id: p.id,
          code: p.barcode || p.id.slice(0, 8).toUpperCase(),
          name: p.name,
          unitPrice: Number(p.default_price || 0),
          stock: stockMap.has(p.id) ? stockMap.get(p.id) : Number(p.stock || 0),
          hasInventoryTrack: stockMap.has(p.id)
        }));
      } catch (err) {
        console.error('RouteX searchProducts failed:', err);
        return [];
      }
    },

    async getNextInvoiceNo(){
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `INV-${todayStr}-${ROUTEX_CONFIG.lorryCode}-`;

      try {
        const rows = await apiFetch(
          `/routex_sales?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&invoice_no=like.${prefix}*&select=invoice_no&order=created_at.desc&limit=100`
        );

        let maxSeq = 0;
        (rows || []).forEach(r => {
          const invNo = String(r.invoice_no || '');
          const parts = invNo.split('-');
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        });

        const nextSeq = maxSeq + 1;
        return `${prefix}${String(nextSeq).padStart(4, '0')}`;
      } catch (err) {
        console.warn('Error fetching next invoice sequence from RouteX, using default sequence 0001:', err);
        return `${prefix}0001`;
      }
    },

    async createSale(saleData){
      const auth = await getAuthSession();
      const saleId = generateUUID();
      const clientSaleId = generateUUID();

      // Ensure valid invoice number
      let invoiceNo = String(saleData.invoice_no || '').trim();
      if (!invoiceNo || !invoiceNo.startsWith('INV-')) {
        invoiceNo = await this.getNextInvoiceNo();
      }

      // Ensure customer exists in RouteX
      let customerId = saleData.customer_id;
      if (!customerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
        const custObj = await this.getOrCreateCustomer({
          name: saleData.customer_name,
          phone: saleData.customer_phone,
          address: saleData.customer_address
        });
        customerId = custObj.id;
      }

      const items = Array.isArray(saleData.items) ? saleData.items : [];
      let totalItems = 0;
      let totalAmount = 0;

      const saleItemRows = items.map(item => {
        const qty = Number(item.qty || 1);
        const unitPrice = Number(item.unitPrice || 0);
        const lineTotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
        totalItems += qty;
        totalAmount += lineTotal;

        return {
          id: generateUUID(),
          sale_id: saleId,
          lorry_id: ROUTEX_CONFIG.translankaLorryId,
          company_id: ROUTEX_CONFIG.translankaCompanyId,
          product_id: (item.product_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.product_id)) ? item.product_id : null,
          quantity: qty,
          individual_quantity: qty,
          unit_price: unitPrice,
          individual_unit_price: unitPrice,
          discount_amount: 0,
          total_line: lineTotal,
          created_by_user_id: auth.userId
        };
      });

      const deliveryCharge = Number(saleData.delivery_charge || 0);
      totalAmount = Math.round((totalAmount + deliveryCharge + Number.EPSILON) * 100) / 100;

      const amountGiven = Number(saleData.amount_given || 0);
      const dueAmount = Math.max(0, Math.round((totalAmount - amountGiven + Number.EPSILON) * 100) / 100);

      let saleType = 'cash';
      const rawMode = String(saleData.payment_mode || '').toLowerCase();
      if (rawMode.includes('cheque')) saleType = 'cheque';
      else if (dueAmount > 0 && amountGiven === 0) saleType = 'due';

      const saleRow = {
        id: saleId,
        invoice_no: invoiceNo,
        sale_date: saleData.sale_date ? new Date(saleData.sale_date).toISOString() : new Date().toISOString(),
        sale_type: saleType,
        customer_id: customerId,
        total_amount: totalAmount,
        total_items: totalItems,
        amount_given: amountGiven,
        change_amount: 0,
        due_amount: dueAmount,
        company_id: ROUTEX_CONFIG.translankaCompanyId,
        lorry_id: ROUTEX_CONFIG.translankaLorryId,
        created_by_user_id: auth.userId,
        client_sale_id: clientSaleId,
        status: 'active',
        delivery_charge: deliveryCharge,
        metadata: {
          source: 'spgs_manual_invoice',
          spgs_invoice_no: invoiceNo,
          customer_name: saleData.customer_name || '',
          synced_at: new Date().toISOString()
        }
      };

      // 1. Insert into routex_sales
      const savedSale = await apiFetch('/routex_sales', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(saleRow)
      });

      // 2. Insert into routex_sale_items
      if (saleItemRows.length > 0) {
        await apiFetch('/routex_sale_items', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(saleItemRows)
        });
      }

      // 3. Update routex_lorry_inventory if items match known inventory products
      for (const item of saleItemRows) {
        if (item.product_id) {
          try {
            const invRows = await apiFetch(
              `/routex_lorry_inventory?lorry_id=eq.${ROUTEX_CONFIG.translankaLorryId}&product_id=eq.${item.product_id}&active=eq.true&limit=1`
            );
            if (invRows && invRows.length > 0) {
              const currentInv = invRows[0];
              const newSold = Number(currentInv.sold_quantity || 0) + item.quantity;
              const newRemaining = Math.max(0, Number(currentInv.loaded_quantity || 0) - newSold);
              await apiFetch(`/routex_lorry_inventory?id=eq.${currentInv.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  sold_quantity: newSold,
                  remaining_quantity: newRemaining,
                  updated_at: new Date().toISOString()
                })
              });
            }
          } catch (invErr) {
            console.warn('Could not update inventory for product ' + item.product_id, invErr);
          }
        }
      }

      return {
        ok: true,
        saleId,
        invoiceNo,
        totalAmount,
        dueAmount,
        customerId,
        rawSale: savedSale
      };
    },

    async fetchTranslankaSales(limit = 250){
      const path = `/routex_sales?company_id=eq.${ROUTEX_CONFIG.translankaCompanyId}&order=created_at.desc&limit=${limit}&select=*,routex_customers(name,phone,address),routex_sale_items(*)`;
      return await apiFetch(path);
    }
  };

  window.RouteXLink = RouteXLink;
  console.log('✅ RouteX Translanka Link initialized (Company: Translanka Nexus Pvt Ltd)');
})(window);

