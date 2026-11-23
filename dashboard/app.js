// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail dialog with the
// model's own inputs and the protocol's farm plan, the live-token set and the valuation
// comparables. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCHLIST = {};
  DATA.rows.forEach(function (r) { if (r.watchlist) WATCHLIST[r.slug] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  var COMP_MULT = {};
  DATA.comps.forEach(function (c) { COMP_MULT[c.category] = c.multiple; });
  function tiltOf(row) {
    var m = COMP_MULT[row.category || 'Other'];
    if (m === undefined) return 1;
    return clamp(Math.pow(m / DATA.fit.global_median, DATA.model.tilt_power), DATA.model.tilt_lo, DATA.model.tilt_hi);
  }
  function impliedOf(row, model, fit) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, model.growth_floor, model.growth_cap);
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var base = row.tvl_usd > 0 ? Math.exp(fit.a) * Math.pow(row.tvl_usd, fit.b) : 0;
    return Math.max(1, Math.round(base * growthMult * maturity * tiltOf(row)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  var L2_CHAINS = { Arbitrum: 1, Base: 1, Optimism: 1, Polygon: 1, Unichain: 1, Ink: 1, Scroll: 1, Blast: 1, Linea: 1, Mode: 1, Zora: 1, 'World Chain': 1, Katana: 1, Arc: 1, Stable: 1, Tempo: 1, Monad: 1, Sonic: 1, Berachain: 1, BOB: 1, Corn: 1, Plasma: 1, 'Hyperliquid L1': 1, 'Robinhood Chain': 1 };
  function gasFor(p) {
    var chain = chainOf(p);
    if (chain === 'Ethereum') return 'about $5 to $15 of gas per transaction';
    if (chain === 'Solana') return 'a few cents of gas per transaction';
    if (L2_CHAINS[chain]) return 'under $1 of gas per transaction';
    return 'a few dollars of gas per transaction';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote when a proposal opens.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + '.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + " and use its native app once a week.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply, then repay it the same week, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add a second, smaller position of about $' + small + ' in another pool of ' + name + ' and keep both open.';
    if (c.indexOf('bridge') >= 0) return 'Use the bridged funds inside one app on the destination chain, then bridge a small amount back.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Use the staking receipt token in one DeFi position on the same chain, such as a lending market.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge and open a fresh one the following week to keep the position active.';
    if (c.indexOf('prediction') >= 0) return 'Place a second small position of about $' + small + ' on a different market the same week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move a small share of about $' + small + ' into a second vault of ' + name + ' and keep both.';
    if (c.indexOf('stable') >= 0) return 'Mint a small amount of about $' + small + ' of the stable asset against the deposit and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Reinvest the yield the position pays into the same asset once it arrives.';
    if (c.indexOf('insurance') >= 0) return 'Buy a second small cover of about $' + small + ' on a different pool and keep both policies.';
    if (c.indexOf('governance') >= 0) return 'Vote in the next proposal when it opens and keep the voting receipt.';
    if (c.indexOf('payment') >= 0) return 'Make one more payment of about $' + small + ' through ' + name + ' the following week.';
    if (c.indexOf('chain') >= 0) return "Use the chain's native app once more that week, such as a swap or a transfer.";
    return 'Make one more qualifying action the following week, such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(p);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital), cost: gas, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind slowly: withdraw in parts and watch the fees and slippage on each one.', cost: 'nothing but the log', time: '5 minutes to log, days to unwind' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.watchlist = true;
    if (params.get('tvl')) state.minTvl = Number(params.get('tvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlist) params.set('wl', '1');
    if (state.minTvl) params.set('tvl', String(state.minTvl));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !WATCHLIST[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { text: 'Token Radar' }),
        el('small', { text: 'pre-token radar' })
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.watchlist_size + ' watchlist protocols, ', el('em', { text: 'ranked by implied value' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, every one the snapshot can rank. Implied value is a model, not a promise: it says what a launch would be worth if the protocol kept running as it is, never whether or when a token comes.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function modelStrip() {
    var v = DATA.validation;
    var fit = DATA.fit;
    return el('div', { class: 'model-strip' },
      el('span', null,
        'Model ', el('b', { text: DATA.model_version }), ': ',
        el('code', { text: 'implied = exp(' + fit.a.toFixed(4) + ') x TVL^' + fit.b.toFixed(4) + ' x growth x maturity x category tilt' }),
        ' fitted on ', el('b', { text: String(fit.n) }), ' live-token comparables. Held out, one protocol at a time, it lands within twice the real market cap for ',
        el('b', { text: Math.round(v.within2 * 100) + '%' }), ' of them (median error ', el('b', { text: Math.round(v.mdape * 100) + '%' }), ', rank correlation ', el('b', { text: v.spearman.toFixed(2) }), ').'
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'tvl', 'aria-label': 'Filter by minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: '$50M TVL or more' }),
      el('option', { value: '100000000', text: '$100M TVL or more' }),
      el('option', { value: '500000000', text: '$500M TVL or more' }),
      el('option', { value: '1000000000', text: '$1B TVL or more' })
    );
    tvlSelect.value = String(state.minTvl);
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value) || 0; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlist ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.comps.length + ' categories with live comparables';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'Min TVL' }), tvlSelect),
      el('label', { class: 'field check', for: 'wl' }, wl, el('span', { text: 'Watchlist only' })),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('comps', 'Comparables'))),
      el('span', { class: 'count', text: shown })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = WATCHLIST[r.slug] ? el('span', { class: 'status watch', text: 'watchlist' }) : el('span', { class: 'status', text: 'no token' });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, badge)
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are the comparables the model learns from, and they are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function compsTable() {
    var tbody = el('tbody');
    DATA.comps.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtMult(c.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: fmtMult(c.tilt) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Valuation comparables: the live-token protocols of each category, their median market cap per dollar of TVL, the shrunk multiple the model uses, and the tilt it gives the category. Ratios are winsorised to 0.01x-2.00x and shrunk toward the market median with strength 3.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple used' }), el('th', { scope: 'col', text: 'Tilt' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var fit = DATA.fit;
    var v = DATA.validation;
    var verdict = 'On value accuracy it edges the flat baseline (median error ' + Math.round(v.mdape * 100) + '% against ' + Math.round(v.baseline_mdape * 100) + '%, within twice the real value for ' + Math.round(v.within2 * 100) + '% against ' + Math.round(v.baseline_within2 * 100) + '%); on rank correlation it ' + (v.spearman >= v.baseline_spearman ? 'matches it' : 'trails it slightly') + ' (' + v.spearman.toFixed(2) + ' against ' + v.baseline_spearman.toFixed(2) + ').';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + fit.a.toFixed(4) + ') x tvl_usd^' + fit.b.toFixed(4) + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x category tilt )'
      ),
      el('p', { class: 'sub', text: 'The base curve is fitted at run time from ' + fit.n + ' live-token protocols: log(market cap) = ' + fit.a.toFixed(4) + ' + ' + fit.b.toFixed(4) + ' x log(TVL). A protocol twice as large is worth less than twice as much, as the market shows. The category tilt compares the protocol\u2019s category multiple with the market median of ' + fit.global_median.toFixed(3) + 'x, dampened to a quarter power and clamped to ' + m.tilt_lo + 'x-' + m.tilt_hi + 'x. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar applies the watchlist\u2019s own exclusion to every row it adds: no wrapped, staked or bridged product of a token that already trades, no exchange, no versioned pool.' }),
      el('h2', { text: 'Held out against the market' }),
      el('p', { class: 'sub', text: 'Each live-token protocol was held out in turn, the fit and its category multiple rebuilt without it, and the prediction compared with its real market cap.' }),
      el('table', { class: 'valid' },
        el('thead', null, el('tr', null, el('th', { text: 'Model' }), el('th', { text: 'Median error' }), el('th', { text: 'Within 2x' }), el('th', { text: 'Rank correlation' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'radar-2 (this board)' }), el('td', { text: Math.round(v.mdape * 100) + '%' }), el('td', { text: Math.round(v.within2 * 100) + '%' }), el('td', { text: v.spearman.toFixed(2) })),
          el('tr', null, el('td', { text: 'Flat 0.25 x TVL baseline' }), el('td', { text: Math.round(v.baseline_mdape * 100) + '%' }), el('td', { text: Math.round(v.baseline_within2 * 100) + '%' }), el('td', { text: v.baseline_spearman.toFixed(2) }))
        )
      ),
      el('p', { class: 'note', text: 'Read it honestly: a token launch is not priced by TVL alone, and this model is a rough ranking heuristic, not a price. ' + verdict + ' What it adds is a stated curve, a category read and a check against the market, so a reader can see where every number comes from. The snapshot records no token for these protocols; that is DefiLlama\u2019s record, not proof that none exists.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var comp = null;
    DATA.comps.forEach(function (c) { if (c.category === (row.category || 'Other')) comp = c; });
    var recomputed = impliedOf(row, DATA.model, DATA.fit);
    var base = row.tvl_usd > 0 ? Math.exp(DATA.fit.a) * Math.pow(row.tvl_usd, DATA.fit.b) : 0;
    var why = 'Rank ' + row.rank + ' because ' + fmtUsd(row.tvl_usd) + ' of TVL on the market\u2019s curve gives a base of ' + fmtUsd(base) +
      ', ' + (row.change_7d === null ? 'with no seven-day growth on record' : 'moved by ' + fmtPct(row.change_7d) + ' over seven days') +
      ', and ' + fmtAge(row.age_days) + ' with no token on record. ' +
      (comp ? 'Its category, ' + (row.category || 'Other') + ', trades at a multiple of ' + fmtMult(comp.multiple) + ' on ' + comp.comps + (comp.comps === 1 ? ' live comparable.' : ' live comparables.') : 'Its category has no live comparables, so it takes no tilt.');
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCHLIST[row.slug] ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base from the curve' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: Number(row.growth_multiplier).toFixed(3) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: Number(row.maturity_multiplier).toFixed(3) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category tilt' }), el('b', { class: 'num', text: Number(row.category_tilt).toFixed(3) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: comp ? fmtMult(comp.multiple) : 'n/a' })),
        el('div', { class: 'wide' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'why', text: why })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(modelStrip());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(compsTable());
    }
    shell.appendChild(el('footer', { class: 'foot', text: 'Source: ' + DATA.source + '. The snapshot records no token for the ranked protocols; that is DefiLlama\u2019s record, not proof that none exists. Implied values are this radar\u2019s own claim, never a market price.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  // Hooks the screenshot and agreement checks use: the page's own functions, nothing else.
  window.__farmSteps = farmSteps;
  window.__impliedOf = function (row) { return impliedOf(row, DATA.model, DATA.fit); };
  window.__rows = DATA.rows;
})();
