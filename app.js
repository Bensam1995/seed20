/* ========================================
   SEED·20 — App Controller
   Vanilla JS SPA — no framework
   ======================================== */

const app = {
  currentView: 'dashboard',
  scanData: [],
  filteredData: [],

  // ── Storage helpers ──
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`s20_${key}`)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(`s20_${key}`, JSON.stringify(val)); },

  // ── Navigation ──
  navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const el = document.getElementById(`view-${view}`);
    if (el) {
      el.style.display = 'block';
      el.classList.remove('view');
      void el.offsetWidth; // trigger reflow
      el.classList.add('view');
    }
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
    if (btn) btn.classList.add('active');
    this.currentView = view;

    // View-specific init
    if (view === 'settings') this.loadSettings();
    if (view === 'journal') this.renderJournal();
    if (view === 'dashboard') this.updateDashboardStats();
  },

  // ══════════════════════════════════════
  //  SCANNER
  // ══════════════════════════════════════
  async runScan() {
    const btnDash = document.getElementById('btn-scan');
    const btnFull = document.getElementById('btn-scan-full');
    const resultsId = this.currentView === 'dashboard' ? 'scanner-results' : 'scanner-full-results';
    const container = document.getElementById(resultsId);

    // Show loading state
    [btnDash, btnFull].forEach(b => { if (b) b.disabled = true; });
    container.innerHTML = '<div class="loading-text"><span class="spinner"></span>Scanning Polymarket...</div>';

    try {
      const config = this.get('config', { limit: 20, minVolume: 10000 });
      const res = await fetch(`/api/scan?limit=${config.limit || 20}`);

      if (!res.ok) {
        // If API route not available (local dev), fetch directly
        const directRes = await fetch(`https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=${config.limit || 20}`);
        this.scanData = await directRes.json();
      } else {
        this.scanData = await res.json();
      }

      this.filteredData = this.filterScanData(this.scanData);
      this.renderScanResults(resultsId, this.currentView === 'dashboard');

      // Save scan timestamp
      this.set('lastScan', new Date().toISOString());
      this.set('lastScanData', this.scanData.slice(0, 30));

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Scan failed: ${err.message}</p><button class="btn-primary" onclick="app.runScan()">Retry</button></div>`;
    }

    [btnDash, btnFull].forEach(b => { if (b) b.disabled = false; });
  },

  filterScanData(data) {
    const cat = document.getElementById('filter-category')?.value || 'all';
    const tagMap = {
      geopolitics: ['Geopolitics', 'World'],
      politics: ['Politics'],
      crypto: ['Crypto'],
      finance: ['Finance', 'Economy', 'Stocks', 'Business'],
      tech: ['Tech'],
    };

    let filtered = [...data];

    if (cat !== 'all' && tagMap[cat]) {
      filtered = filtered.filter(ev => {
        const tagLabels = (ev.tags || []).map(t => t.label);
        return tagMap[cat].some(t => tagLabels.includes(t));
      });
    }

    return filtered;
  },

  applyFilters() {
    this.filteredData = this.filterScanData(this.scanData);
    this.renderScanResults('scanner-full-results', false);
  },

  renderScanResults(containerId, compact) {
    const container = document.getElementById(containerId);
    const data = compact ? this.filteredData.slice(0, 5) : this.filteredData;

    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><p>No markets found</p></div>';
      return;
    }

    const rows = data.map((ev, idx) => {
      const market = this.getActiveMarket(ev);
      if (!market) return '';

      const price = this.parsePrice(market.outcomePrices);
      const vol24 = this.formatVol(ev.volume24hr);
      const weekChange = parseFloat(market.oneWeekPriceChange || 0);
      const priceClass = price < 0.2 ? 'price-low' : price > 0.7 ? 'price-high' : 'price-mid';
      const trendClass = weekChange > 0.01 ? 'trend-up' : weekChange < -0.01 ? 'trend-down' : 'trend-flat';
      const trendIcon = weekChange > 0.01 ? '↗' : weekChange < -0.01 ? '↘' : '→';
      const safeQuestion = (market.question || ev.title || '').replace(/"/g, '&quot;');

      return `<tr data-slug="${ev.slug}" title="${safeQuestion}">
        <td class="market-question">${market.question || ev.title}</td>
        <td><span class="price-pill ${priceClass}">${(price * 100).toFixed(0)}¢</span></td>
        <td class="vol">${vol24}</td>
        <td class="${trendClass}">${trendIcon}</td>
      </tr>`;
    }).filter(Boolean).join('');

    container.innerHTML = `
      <table class="market-table">
        <thead><tr><th>Market</th><th>Price</th><th>Vol 24h</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    // Event delegation for row clicks
    container.querySelector('tbody').addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-slug]');
      if (row) app.openResearch(row.dataset.slug);
    });
  },

  getActiveMarket(event) {
    if (!event.markets?.length) return null;
    // Prefer open markets, sorted by volume
    const open = event.markets.filter(m => !m.closed && m.active);
    if (open.length) return open.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0];
    return event.markets[0];
  },

  parsePrice(pricesStr) {
    try {
      const prices = JSON.parse(pricesStr);
      return parseFloat(prices[0]) || 0;
    } catch { return 0; }
  },

  formatVol(vol) {
    if (!vol) return '$0';
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
    return `$${Math.round(vol)}`;
  },

  // ══════════════════════════════════════
  //  RESEARCH
  // ══════════════════════════════════════
  openResearch(slug) {
    this.navigate('research');
    document.getElementById('research-slug').value = slug;
    const ev = this.scanData.find(e => e.slug === slug);
    if (ev) this.showMarketInfo(ev);
    this.loadMarketForResearch();
  },

  async loadMarketForResearch() {
    const slug = document.getElementById('research-slug').value.trim();
    if (!slug) return;

    const infoDiv = document.getElementById('research-market-info');
    const controls = document.getElementById('research-controls');
    const output = document.getElementById('research-output');
    output.style.display = 'none';

    // Check cache first
    let ev = this.scanData.find(e => e.slug === slug);

    if (!ev) {
      // Fetch from API
      try {
        const res = await fetch(`https://gamma-api.polymarket.com/events/slug/${slug}`);
        if (res.ok) ev = await res.json();
      } catch {}
    }

    if (ev) {
      this.showMarketInfo(ev);
      this._currentResearchEvent = ev;
    } else {
      infoDiv.style.display = 'none';
      controls.style.display = 'none';
      document.getElementById('research-content').innerHTML = '<div class="empty-state"><p>Market not found. Check the slug.</p></div>';
      output.style.display = 'block';
      return;
    }
  },

  showMarketInfo(ev) {
    const market = this.getActiveMarket(ev);
    const price = market ? this.parsePrice(market.outcomePrices) : 0;
    const vol = this.formatVol(ev.volume || 0);
    const endDate = market?.endDateIso || 'N/A';

    document.getElementById('research-question').textContent = market?.question || ev.title;
    document.getElementById('research-price').textContent = `${(price * 100).toFixed(0)}¢ Yes`;
    document.getElementById('research-volume').textContent = `Vol: ${vol}`;
    document.getElementById('research-end').textContent = `Ends: ${endDate}`;
    document.getElementById('research-market-info').style.display = 'block';
    document.getElementById('research-controls').style.display = 'block';
  },

  async runResearch() {
    const ev = this._currentResearchEvent;
    if (!ev) return;

    const model = document.querySelector('input[name="model"]:checked')?.value || 'gemini';
    const btn = document.getElementById('btn-research');
    const output = document.getElementById('research-output');
    const content = document.getElementById('research-content');

    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    output.style.display = 'block';
    content.innerHTML = '<div class="loading-text"><span class="spinner"></span>Running deep analysis...</div>';

    const market = this.getActiveMarket(ev);
    const price = market ? this.parsePrice(market.outcomePrices) : 0;

    const payload = {
      model,
      slug: ev.slug,
      question: market?.question || ev.title,
      description: market?.description || ev.description || '',
      currentPrice: price,
      volume: ev.volume || 0,
      volume24hr: ev.volume24hr || 0,
      endDate: market?.endDateIso || '',
      tags: (ev.tags || []).map(t => t.label),
      context: ev.eventMetadata?.context_description || '',
    };

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        // Show the actual server error, and try direct as last resort
        console.warn('Server API error:', data.error);
        try {
          const analysis = await this.directResearch(payload);
          content.innerHTML = this.formatResearch(analysis);
        } catch (fallbackErr) {
          content.innerHTML = `<div class="empty-state"><p>Server error: ${data.error || 'Unknown'}</p><p class="muted">Direct fallback also failed: ${fallbackErr.message}</p></div>`;
        }
      } else {
        content.innerHTML = this.formatResearch(data.analysis);
      }
    } catch (err) {
      // Network error — API route doesn't exist (local dev)
      try {
        const analysis = await this.directResearch(payload);
        content.innerHTML = this.formatResearch(analysis);
      } catch (err2) {
        content.innerHTML = `<div class="empty-state"><p>Research failed: ${err2.message}</p><p class="muted">Make sure API keys are configured in Settings</p></div>`;
      }
    }

    btn.disabled = false;
    btn.textContent = 'Run Deep Analysis';
  },

  async directResearch(payload) {
    const keys = this.get('keys', {});
    const model = payload.model;

    const systemPrompt = `You are an expert prediction market analyst. You have deep knowledge of geopolitics, economics, and institutional dynamics. You also understand Integral Theory / Spiral Dynamics and can apply it as one analytical lens among others.

Analyze the following prediction market and provide:
1. **Summary Assessment**: Is this market overpriced, underpriced, or fairly priced for Yes? State confidence level (Low/Medium/High).
2. **Resolution Criteria**: Parse what exactly needs to happen for Yes/No resolution.
3. **Current Situation**: What's the latest on this event? Key developments.
4. **Integral Analysis** (if applicable for geopolitical/institutional markets): Map key actors to developmental stages (Red/Blue/Orange/Green). Identify stage clashes and potential blind spots in the market consensus.
5. **Standard Analysis**: Base rate, catalysts, time decay, liquidity.
6. **Risk Assessment**: Steelman the opposing view. What could make your assessment wrong?
7. **Recommendation**: Buy Yes / Buy No / Pass, with suggested position size for a $20 bankroll.

Format with clear markdown headers. Be direct and actionable — no filler.`;

    const userPrompt = `Market: "${payload.question}"
Current Yes Price: ${(payload.currentPrice * 100).toFixed(1)}¢
Total Volume: $${Math.round(payload.volume).toLocaleString()}
24hr Volume: $${Math.round(payload.volume24hr).toLocaleString()}
Resolution Date: ${payload.endDate}
Tags: ${payload.tags.join(', ')}

Resolution Description:
${payload.description.slice(0, 1500)}

${payload.context ? `Current Context (from Polymarket):\n${payload.context}` : ''}`;

    if (model === 'gemini' && keys.gemini) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
        }),
      });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini';

    } else if (model === 'openai' && keys.openai) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keys.openai}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from OpenAI';

    } else {
      throw new Error(`No API key for ${model}. Add it in Settings.`);
    }
  },

  formatResearch(text) {
    if (!text) return '<p class="muted">No analysis generated</p>';

    // Simple markdown → HTML
    let html = text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Wrap list items in <ul>
    html = html.replace(/((<li>.*?<\/li>\s*<br>?)+)/g, '<ul>$1</ul>');
    html = `<p>${html}</p>`;

    // Extract and highlight the assessment if present
    const assessMatch = text.match(/(?:under|over|fairly?)[\s-]?priced/i);
    if (assessMatch) {
      const confMatch = text.match(/confidence[:\s]*(low|medium|high)/i);
      html = `<div class="assessment"><strong>System Assessment:</strong> ${assessMatch[0].toUpperCase()}${confMatch ? ` • Confidence: ${confMatch[1]}` : ''}</div>${html}`;
    }

    return html;
  },

  // ══════════════════════════════════════
  //  JOURNAL
  // ══════════════════════════════════════
  renderJournal() {
    const entries = this.get('journal', []);
    const container = document.getElementById('journal-entries');

    if (!entries.length) {
      container.innerHTML = '<div class="empty-state"><p>No predictions logged yet</p><p class="muted">Start by running a scan and researching a market</p></div>';
      return;
    }

    container.innerHTML = entries.map((e, i) => `
      <div class="journal-entry">
        <div class="journal-entry-header">
          <span class="journal-question">${e.market}</span>
          <span class="journal-status status-${e.status}">${e.status}</span>
        </div>
        <div class="journal-meta">
          ${e.position.toUpperCase()} @ ${e.entryPrice}¢ · $${e.size} · Sys: ${e.sysConf}% / You: ${e.userConf}% · ${e.date}
        </div>
      </div>
    `).join('');
  },

  showAddPrediction() {
    document.getElementById('modal-prediction').style.display = 'flex';

    // Wire up range sliders
    const sysSlider = document.getElementById('pred-sys-conf');
    const userSlider = document.getElementById('pred-user-conf');
    sysSlider.oninput = () => document.getElementById('pred-sys-conf-val').textContent = sysSlider.value + '%';
    userSlider.oninput = () => document.getElementById('pred-user-conf-val').textContent = userSlider.value + '%';
  },

  hideAddPrediction() {
    document.getElementById('modal-prediction').style.display = 'none';
  },

  savePrediction() {
    const market = document.getElementById('pred-market').value.trim();
    if (!market) return;

    const entry = {
      id: Date.now().toString(36),
      date: new Date().toISOString().split('T')[0],
      market,
      position: document.querySelector('input[name="pred-position"]:checked')?.value || 'yes',
      entryPrice: document.getElementById('pred-price').value || '50',
      size: document.getElementById('pred-size').value || '5',
      sysConf: document.getElementById('pred-sys-conf').value,
      userConf: document.getElementById('pred-user-conf').value,
      rationale: document.getElementById('pred-rationale').value,
      status: 'open',
      pnl: null,
    };

    const journal = this.get('journal', []);
    journal.unshift(entry);
    this.set('journal', journal);

    this.hideAddPrediction();
    this.renderJournal();
    this.updateDashboardStats();

    // Clear form
    document.getElementById('pred-market').value = '';
    document.getElementById('pred-rationale').value = '';
    document.getElementById('pred-price').value = '';
    document.getElementById('pred-size').value = '';
  },

  // ══════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════
  loadSettings() {
    const keys = this.get('keys', {});
    if (keys.gemini) {
      document.getElementById('key-gemini').value = keys.gemini;
      document.getElementById('status-gemini').innerHTML = '<span class="key-ok">✓ Configured</span>';
      document.getElementById('status-gemini').className = 'key-status';
    } else {
      document.getElementById('status-gemini').innerHTML = '<span class="key-missing">Not set</span>';
    }
    if (keys.openai) {
      document.getElementById('key-openai').value = keys.openai;
      document.getElementById('status-openai').innerHTML = '<span class="key-ok">✓ Configured</span>';
    } else {
      document.getElementById('status-openai').innerHTML = '<span class="key-missing">Not set</span>';
    }

    const config = this.get('config', { limit: 20, minVolume: 10000 });
    document.getElementById('cfg-limit').value = config.limit || 20;
    document.getElementById('cfg-min-volume').value = config.minVolume || 10000;

    const ledger = this.get('ledger', { seed: 20, bankroll: 20 });
    document.getElementById('cfg-seed').value = ledger.seed;
    document.getElementById('cfg-bankroll').value = ledger.bankroll;
  },

  saveKeys() {
    const keys = {
      gemini: document.getElementById('key-gemini').value.trim(),
      openai: document.getElementById('key-openai').value.trim(),
    };
    this.set('keys', keys);
    this.loadSettings(); // refresh statuses
  },

  saveConfig() {
    this.set('config', {
      limit: parseInt(document.getElementById('cfg-limit').value) || 20,
      minVolume: parseInt(document.getElementById('cfg-min-volume').value) || 10000,
    });
  },

  saveLedger() {
    this.set('ledger', {
      seed: parseFloat(document.getElementById('cfg-seed').value) || 20,
      bankroll: parseFloat(document.getElementById('cfg-bankroll').value) || 20,
    });
    this.updateDashboardStats();
  },

  // ══════════════════════════════════════
  //  DASHBOARD STATS
  // ══════════════════════════════════════
  updateDashboardStats() {
    const ledger = this.get('ledger', { seed: 20, bankroll: 20 });
    const journal = this.get('journal', []);
    const open = journal.filter(j => j.status === 'open').length;
    const resolved = journal.filter(j => j.status === 'won' || j.status === 'lost');
    const winRate = resolved.length ? Math.round((resolved.filter(j => j.status === 'won').length / resolved.length) * 100) + '%' : '—';

    document.getElementById('stat-bankroll').textContent = `$${ledger.bankroll.toFixed(2)}`;
    document.getElementById('stat-positions').textContent = open;
    document.getElementById('stat-winrate').textContent = winRate;

    // If we have cached scan data, render it
    if (!this.scanData.length) {
      const cached = this.get('lastScanData', []);
      if (cached.length) {
        this.scanData = cached;
        this.filteredData = cached;
        this.renderScanResults('scanner-results', true);
      }
    }
  },

  // ══════════════════════════════════════
  //  DATA EXPORT/IMPORT
  // ══════════════════════════════════════
  exportData() {
    const data = {
      keys: this.get('keys', {}),
      config: this.get('config', {}),
      ledger: this.get('ledger', {}),
      journal: this.get('journal', []),
      lastScan: this.get('lastScan', null),
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seed20_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  clearData() {
    if (confirm('This will clear ALL data including journal entries. Continue?')) {
      Object.keys(localStorage).filter(k => k.startsWith('s20_')).forEach(k => localStorage.removeItem(k));
      this.scanData = [];
      this.filteredData = [];
      this.navigate('dashboard');
    }
  },

  // ══════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════
  init() {
    this.updateDashboardStats();

    // Check for hash navigation
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(`view-${hash}`)) {
      this.navigate(hash);
    }
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => app.init());
