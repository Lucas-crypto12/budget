'use strict'

// ── State ──────────────────────────────────────────────────
const state = {
  customers: [],
  selectedId: null,
  activeTab: 'overview',
}

// ── API helpers ────────────────────────────────────────────
async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body != null) opts.body = JSON.stringify(body)
  const res = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const apiGet    = path        => apiFetch('GET',    path)
const apiPost   = (path, b)   => apiFetch('POST',   path, b)
const apiPut    = (path, b)   => apiFetch('PUT',    path, b)
const apiDelete = path        => apiFetch('DELETE', path)

// ── Toasts ────────────────────────────────────────────────
function toast(message, type = 'success') {
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.textContent = message
  document.getElementById('toast-container').appendChild(el)
  setTimeout(() => el.remove(), 3800)
}

// ── Modal ─────────────────────────────────────────────────
function openModal(html) {
  const overlay = document.getElementById('modal-overlay')
  document.getElementById('modal').innerHTML = html
  overlay.classList.remove('hidden')
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() }, { once: true })
  document.querySelectorAll('#modal .btn-close').forEach(b => b.addEventListener('click', closeModal))
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden')
}

// ── Load customers ─────────────────────────────────────────
async function loadCustomers() {
  state.customers = await apiGet('/customers')
}

// ── Sidebar ────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('customer-list')
  if (!state.customers.length) {
    list.innerHTML = '<li class="sidebar-empty">Ingen kunder endnu</li>'
    return
  }
  list.innerHTML = state.customers.map(c => `
    <li class="customer-item ${c.id === state.selectedId ? 'active' : ''}" data-id="${c.id}">
      <div class="customer-name">${esc(c.name)}</div>
      <div class="customer-meta">
        ${c.lastSyncAt ? `Sync ${relTime(c.lastSyncAt)}` : 'Aldrig synkroniseret'}
        · ${c._count.transactions} poster
      </div>
    </li>`).join('')
  list.querySelectorAll('.customer-item').forEach(el =>
    el.addEventListener('click', () => selectCustomer(el.dataset.id))
  )
}

// ── Cron status in sidebar footer ─────────────────────────
async function loadCronStatus() {
  try {
    const { syncSchedule } = await apiGet('/health')
    const el = document.getElementById('cron-text')
    if (!el) return
    if (syncSchedule) {
      el.textContent = `Næste sync: ${formatCron(syncSchedule)}`
    } else {
      el.textContent = 'Automatisk sync deaktiveret'
      document.querySelector('.cron-dot').style.background = '#64748b'
    }
  } catch (_) {}
}

// ── Select customer ────────────────────────────────────────
async function selectCustomer(id) {
  state.selectedId = id
  state.activeTab = 'overview'
  renderSidebar()
  renderCustomerShell()
  await renderTab()
}

// ── Customer view shell (header + tabs) ───────────────────
function renderCustomerShell() {
  const customer = state.customers.find(c => c.id === state.selectedId)
  if (!customer) return

  document.getElementById('welcome').classList.add('hidden')
  const view = document.getElementById('customer-view')
  view.classList.remove('hidden')

  const TABS = [
    { id: 'overview',     label: 'Oversigt' },
    { id: 'mappings',     label: 'Kontoopsætning' },
    { id: 'transactions', label: 'Transaktioner' },
    { id: 'settings',     label: 'Indstillinger' },
  ]

  view.innerHTML = `
    <div class="page-header"><h2>${esc(customer.name)}</h2></div>
    <div class="tabs">
      ${TABS.map(t => `
        <button class="tab-btn ${t.id === state.activeTab ? 'active' : ''}" data-tab="${t.id}">
          ${t.label}
        </button>`).join('')}
    </div>
    <div id="tab-content"></div>`

  view.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      state.activeTab = btn.dataset.tab
      view.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn))
      await renderTab()
    })
  )
}

// ── Tab router ─────────────────────────────────────────────
async function renderTab() {
  const map = {
    overview:     renderOverviewTab,
    mappings:     renderMappingsTab,
    transactions: renderTransactionsTab,
    settings:     renderSettingsTab,
  }
  if (map[state.activeTab]) await map[state.activeTab]()
}

// ── OVERVIEW TAB ───────────────────────────────────────────
async function renderOverviewTab() {
  const customer = state.customers.find(c => c.id === state.selectedId)
  const content  = document.getElementById('tab-content')

  content.innerHTML = `
    <div class="grid-3">
      <div class="card stat-card">
        <div class="stat-value">${customer._count.transactions}</div>
        <div class="stat-label">Bogførte poster</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${customer.lastSyncAt ? relTime(customer.lastSyncAt) : '—'}</div>
        <div class="stat-label">Seneste sync</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value" id="next-sync-stat">...</div>
        <div class="stat-label">Planlagt sync</div>
      </div>
    </div>

    <div class="card">
      <h3>Synkroniser nu</h3>
      <p class="help-text">
        Henter nye transaktioner fra MobilePay og bogfører dem i e-conomic.
        Allerede bogførte transaktioner springes automatisk over.
      </p>
      <div class="sync-form">
        <div class="date-range">
          <div class="form-group" style="margin:0">
            <label>Fra dato <span style="font-weight:400;color:var(--muted)">(valgfri)</span></label>
            <input type="date" id="sync-from" style="max-width:160px" />
          </div>
          <div class="form-group" style="margin:0">
            <label>Til dato <span style="font-weight:400;color:var(--muted)">(valgfri)</span></label>
            <input type="date" id="sync-to" style="max-width:160px" />
          </div>
        </div>
        <div class="form-group" style="margin:0;align-self:flex-end">
          <button id="btn-sync" class="btn btn-primary">▶ Synkroniser</button>
        </div>
      </div>
      <div id="sync-result"></div>
    </div>`

  // Fill in cron schedule stat
  apiGet('/health').then(d => {
    const el = document.getElementById('next-sync-stat')
    if (el) el.textContent = d.syncSchedule ? formatCron(d.syncSchedule) : 'Slået fra'
  }).catch(() => {})

  document.getElementById('btn-sync').addEventListener('click', async () => {
    const btn  = document.getElementById('btn-sync')
    const from = document.getElementById('sync-from').value
    const to   = document.getElementById('sync-to').value

    btn.disabled    = true
    btn.textContent = '⏳ Synkroniserer...'

    try {
      const body = {}
      if (from) body.dateFrom = from
      if (to)   body.dateTo   = to

      const result = await apiPost(`/sync/${state.selectedId}`, body)

      document.getElementById('sync-result').innerHTML = `
        <div class="sync-result-card">
          <div class="sync-stats">
            <span class="sync-stat sync-ok">✓ ${result.synced} bogført</span>
            <span class="sync-stat sync-skip">→ ${result.skipped} sprunget over</span>
            <span class="sync-stat ${result.errors.length ? 'sync-err' : 'sync-ok'}">
              ${result.errors.length ? '✗' : '✓'} ${result.errors.length} fejl
            </span>
          </div>
          ${result.errors.length ? `
            <ul class="sync-errors">
              ${result.errors.map(e => `<li>${esc(e)}</li>`).join('')}
            </ul>` : ''}
          <div class="sync-range">Periode: ${result.dateFrom} → ${result.dateTo}</div>
        </div>`

      await loadCustomers()
      renderSidebar()
      toast(`Sync afsluttet: ${result.synced} bogført, ${result.errors.length} fejl`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      btn.disabled    = false
      btn.textContent = '▶ Synkroniser'
    }
  })
}

// ── MAPPINGS TAB ───────────────────────────────────────────
async function renderMappingsTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = '<div class="loading">Henter kontoopsætning...</div>'

  const mappings = await apiGet(`/customers/${state.selectedId}/mappings`)
  const byType   = Object.fromEntries(mappings.map(m => [m.entryType, m]))

  const ENTRY_TYPES = [
    { type: 'capture', label: 'Betaling modtaget',  desc: 'Kunde betaler via MobilePay' },
    { type: 'refund',  label: 'Refundering',         desc: 'Betaling refunderes til kunde' },
    { type: 'fee',     label: 'MobilePay gebyr',     desc: 'Transaktionsgebyr til MobilePay' },
    { type: 'payout',  label: 'Udbetaling',          desc: 'Udbetaling til din bankkonto' },
  ]

  content.innerHTML = `
    <div class="card">
      <h3>Kontoopsætning</h3>
      <p class="help-text">
        Angiv e-conomic kontonumre for hver transaktionstype.
        Lad felter stå tomme for typer, du ikke bruger.
      </p>
      <table class="mappings-table">
        <thead>
          <tr>
            <th style="width:220px">Transaktionstype</th>
            <th>Debet konto</th>
            <th>Kredit konto</th>
            <th>Momskode</th>
          </tr>
        </thead>
        <tbody>
          ${ENTRY_TYPES.map(({ type, label, desc }) => {
            const m = byType[type] || {}
            return `<tr>
              <td>
                <div class="entry-type-label">${label}</div>
                <div class="entry-type-desc">${desc}</div>
              </td>
              <td><input class="input-sm" type="number" data-type="${type}" data-field="debit"
                  value="${m.debitAccount || ''}" placeholder="f.eks. 11100" /></td>
              <td><input class="input-sm" type="number" data-type="${type}" data-field="credit"
                  value="${m.creditAccount || ''}" placeholder="f.eks. 1000" /></td>
              <td><input class="input-sm input-vat" type="text" data-type="${type}" data-field="vat"
                  value="${m.vatCode || ''}" placeholder="B25" /></td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <div class="form-actions">
        <button id="btn-save-mappings" class="btn btn-primary">Gem kontoopsætning</button>
      </div>
    </div>`

  document.getElementById('btn-save-mappings').addEventListener('click', async () => {
    const toSave = ENTRY_TYPES.flatMap(({ type }) => {
      const debit  = content.querySelector(`[data-type="${type}"][data-field="debit"]`).value
      const credit = content.querySelector(`[data-type="${type}"][data-field="credit"]`).value
      const vat    = content.querySelector(`[data-type="${type}"][data-field="vat"]`).value.trim()
      if (!debit || !credit) return []
      return [{ entryType: type, debitAccount: +debit, creditAccount: +credit, ...(vat ? { vatCode: vat } : {}) }]
    })

    try {
      await apiPut(`/customers/${state.selectedId}/mappings`, { mappings: toSave })
      toast('Kontoopsætning gemt')
    } catch (err) {
      toast(err.message, 'error')
    }
  })
}

// ── TRANSACTIONS TAB ───────────────────────────────────────
async function renderTransactionsTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = '<div class="loading">Henter transaktioner...</div>'

  const data = await apiGet(`/customers/${state.selectedId}/transactions?limit=50`)

  if (!data.transactions.length) {
    content.innerHTML = `
      <div class="card empty-state">
        <p>Ingen bogførte transaktioner endnu.</p>
        <p>Kør en synkronisering under fanen <strong>Oversigt</strong>.</p>
      </div>`
    return
  }

  content.innerHTML = `
    <div class="card">
      <div class="table-header">
        <h3>Bogførte transaktioner</h3>
        <span class="badge">${data.total} i alt</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Type</th>
            <th>Beløb</th>
            <th>Reference</th>
            <th>Bilag #</th>
            <th>Bogført</th>
          </tr>
        </thead>
        <tbody>
          ${data.transactions.map(tx => `
            <tr>
              <td>${tx.ledgerDate.split('T')[0]}</td>
              <td><span class="badge badge-${tx.entryType}">${entryTypeLabel(tx.entryType)}</span></td>
              <td class="amount ${tx.amount < 0 ? 'neg' : ''}">${fmtAmount(tx.amount, tx.currency)}</td>
              <td class="mono">${esc(tx.reference || tx.pspReference.substring(0, 14) + '…')}</td>
              <td>${tx.voucherNumber ?? '—'}</td>
              <td class="muted">${relTime(tx.bookedAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${data.total > 50 ? `<div class="table-footer">Viser 50 af ${data.total} transaktioner</div>` : ''}
    </div>`
}

// ── SETTINGS TAB ───────────────────────────────────────────
async function renderSettingsTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = '<div class="loading">Henter indstillinger...</div>'

  const c = await apiGet(`/customers/${state.selectedId}`)

  content.innerHTML = `
    <div class="card">
      <h3>Kundeinformation</h3>
      <form id="form-settings">
        <div class="form-group">
          <label>Virksomhedsnavn</label>
          <input name="name" value="${esc(c.name)}" required />
        </div>

        <div class="section-title">MobilePay / Vipps</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Client ID</label>
            <input name="mobilepayClientId" value="${esc(c.mobilepayClientId)}" />
          </div>
          <div class="form-group">
            <label>Client Secret</label>
            <input name="mobilepayClientSecret" type="password"
                   placeholder="Efterlad tom for at beholde" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Subscription Key</label>
            <input name="mobilepaySubscriptionKey" value="${esc(c.mobilepaySubscriptionKey)}" />
          </div>
          <div class="form-group">
            <label>Merchant Serial Number</label>
            <input name="mobilepayMerchantSerialNumber" value="${esc(c.mobilepayMerchantSerialNumber)}" />
          </div>
        </div>

        <div class="section-title">e-conomic</div>
        <div class="form-grid">
          <div class="form-group">
            <label>App Secret Token</label>
            <input name="economicAppSecretToken" type="password"
                   placeholder="Efterlad tom for at beholde" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Agreement Grant Token</label>
            <input name="economicAgreementGrantToken" type="password"
                   placeholder="Efterlad tom for at beholde" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Journal nummer</label>
            <input name="economicJournalNumber" type="number"
                   value="${c.economicJournalNumber}" style="max-width:120px" />
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Gem ændringer</button>
          <button type="button" id="btn-delete-customer" class="btn btn-danger">Slet kunde</button>
        </div>
      </form>
    </div>`

  const SECRET_FIELDS = ['mobilepayClientSecret', 'economicAppSecretToken', 'economicAgreementGrantToken']

  document.getElementById('form-settings').addEventListener('submit', async e => {
    e.preventDefault()
    const data = {}
    for (const [k, v] of new FormData(e.target).entries()) {
      if (SECRET_FIELDS.includes(k) && !v) continue
      if (v !== '') data[k] = v
    }
    try {
      await apiPut(`/customers/${state.selectedId}`, data)
      await loadCustomers()
      renderSidebar()
      toast('Indstillinger gemt')
    } catch (err) {
      toast(err.message, 'error')
    }
  })

  document.getElementById('btn-delete-customer').addEventListener('click', async () => {
    const name = c.name
    if (!confirm(`Er du sikker på, at du vil slette "${name}"?\n\nAl kontoopsætning og transaktionshistorik slettes permanent.`)) return
    try {
      await apiDelete(`/customers/${state.selectedId}`)
      state.selectedId = null
      await loadCustomers()
      renderSidebar()
      document.getElementById('customer-view').classList.add('hidden')
      document.getElementById('welcome').classList.remove('hidden')
      toast(`"${name}" er slettet`)
    } catch (err) {
      toast(err.message, 'error')
    }
  })
}

// ── ADD CUSTOMER MODAL ─────────────────────────────────────
function showAddCustomerModal() {
  openModal(`
    <div class="modal-header">
      <h2>Tilføj ny kunde</h2>
      <button class="btn-icon btn-close" title="Luk">✕</button>
    </div>
    <form id="form-add-customer">
      <div class="form-group">
        <label>Virksomhedsnavn *</label>
        <input name="name" required placeholder="Eksempel ApS" autofocus />
      </div>

      <div class="section-title">MobilePay / Vipps</div>
      <div class="form-group">
        <label>Client ID *</label>
        <input name="mobilepayClientId" required />
      </div>
      <div class="form-group">
        <label>Client Secret *</label>
        <input name="mobilepayClientSecret" type="password" required autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Subscription Key *</label>
        <input name="mobilepaySubscriptionKey" required />
      </div>
      <div class="form-group">
        <label>Merchant Serial Number *</label>
        <input name="mobilepayMerchantSerialNumber" required />
      </div>

      <div class="section-title">e-conomic</div>
      <div class="form-group">
        <label>App Secret Token *</label>
        <input name="economicAppSecretToken" type="password" required autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Agreement Grant Token *</label>
        <input name="economicAgreementGrantToken" type="password" required autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Journal nummer * <span style="font-weight:400;color:var(--muted)">(fra e-conomic)</span></label>
        <input name="economicJournalNumber" type="number" required
               placeholder="f.eks. 1" style="max-width:140px" />
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Opret kunde</button>
        <button type="button" class="btn btn-secondary btn-close">Annuller</button>
      </div>
    </form>`)

  document.getElementById('form-add-customer').addEventListener('submit', async e => {
    e.preventDefault()
    const btn  = e.submitter
    const data = Object.fromEntries(new FormData(e.target).entries())
    btn.disabled    = true
    btn.textContent = 'Opretter...'
    try {
      const customer = await apiPost('/customers', data)
      await loadCustomers()
      renderSidebar()
      closeModal()
      toast(`"${data.name}" er tilføjet`)
      await selectCustomer(customer.id)
    } catch (err) {
      toast(err.message, 'error')
      btn.disabled    = false
      btn.textContent = 'Opret kunde'
    }
  })
}

// ── Utilities ──────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function relTime(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)   return 'lige nu'
  if (m < 60)  return `${m} min. siden`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h} t. siden`
  const d = Math.floor(h / 24)
  return `${d} dag${d !== 1 ? 'e' : ''} siden`
}

function fmtAmount(amount, currency) {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency }).format(amount)
}

function formatCron(expr) {
  if (expr === '0 * * * *')  return 'Hver time'
  const p = expr.split(' ')
  if (p.length === 5 && p[0] === '0' && p[2] === '*' && p[3] === '*' && p[4] === '*')
    return `Dagligt kl. ${p[1].padStart(2, '0')}:00`
  return expr
}

function entryTypeLabel(type) {
  return { capture: 'Betaling', refund: 'Refundering', fee: 'Gebyr', payout: 'Udbetaling' }[type] ?? type
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  document.getElementById('btn-add-customer').addEventListener('click', showAddCustomerModal)

  await loadCustomers()
  renderSidebar()
  loadCronStatus()

  if (state.customers.length > 0) {
    await selectCustomer(state.customers[0].id)
  }
}

init().catch(err => {
  console.error('Init fejl:', err)
  toast('Kunne ikke forbinde til serveren', 'error')
})
