// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the snapshot can rank: the early rows the radar exists to find. The
// early radar applies the watchlist's own exclusion to every row it adds: no wrapped, staked or
// bridged product of a token that already trades, no exchange, no versioned pool. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board. They do a second job: they are the valuation comparables.
//
// Implied value follows only from the snapshot's own figures, fitted at run time from the live
// protocols, never from a hand-written list of names or a hardcoded multiple:
//
//   comps      = live-token protocols with a market cap above zero and TVL above zero, exchanges
//                left out (an exchange token is not a comparable for a protocol's launch)
//   ratio      = mcap_usd / tvl_usd, winsorised to [0.01, 2.0] so one tiny-TVL outlier cannot set
//                a category's price
//   catMult    = the category's median ratio, shrunk toward the global median with strength 3,
//                clamped to [0.05, 1.5]
//   log-log    = ordinary least squares on the comps: log(mcap) = a + b * log(tvl)
//   base       = exp(a) * tvl_usd ^ b          (the market's own TVL-to-value curve; b < 1, so a
//                                                protocol twice as large is worth less than twice
//                                                as much, as the comps show)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) * GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age_days unknown: 365)
//   tilt       = clamp((catMult / globalMedian) ^ 0.25, 0.85, 1.4)
//   implied    = max(1, round(base * growthMult * maturity * tilt))
//
// The same code also scores the model against the market it learned from: every live-token
// protocol is held out in turn, the fit and the category multiple are rebuilt without it, and the
// prediction is compared with its real market cap. The dashboard states the result (median
// absolute percentage error, the share within twice the real value, and the Spearman rank
// correlation) beside the same figures for a flat 0.25 x TVL baseline, so a reader can see the
// model is a rough ranking heuristic, not a price.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. The fit (a, b, multiples) is derived. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  shrink_k: number;
  ratio_lo: number;
  ratio_hi: number;
  multiple_lo: number;
  multiple_hi: number;
  tilt_power: number;
  tilt_lo: number;
  tilt_hi: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_k: 3,
  ratio_lo: 0.01,
  ratio_hi: 2.0,
  multiple_lo: 0.05,
  multiple_hi: 1.5,
  tilt_power: 0.25,
  tilt_lo: 0.85,
  tilt_hi: 1.4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_value: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    category_multiple: number;
    category_tilt: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_tilt: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One category's valuation comparables, for the dashboard's comps table. */
export interface CompRow {
  category: string;
  comps: number;
  median_ratio: number;
  multiple: number;
  tilt: number;
}

/** The held-out validation of the model against the live-token market. */
export interface Validation {
  comps: number;
  mdape: number;
  within2: number;
  spearman: number;
  baseline_mdape: number;
  baseline_within2: number;
  baseline_spearman: number;
}

/** The log-log fit on the live comparables. */
export interface LogLogFit {
  a: number;
  b: number;
  n: number;
  global_median: number;
}

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: LogLogFit;
  validation: Validation;
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name: the exchange's product, not a protocol's launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Categories the watchlist's own rule keeps out: a bridged, wrapped or staked product of a token
 * that already trades is not a token that does not exist yet.
 */
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/**
 * Whether a protocol is one the board may rank beyond the watchlist: pre-token, and none of the
 * watchlist's exclusions (a wrapped, staked or bridged product, an exchange, a versioned pool).
 * The watchlist itself is always covered whole: the floor is never gambled on this rule.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** Whether a protocol can serve as a valuation comparable: a live token with a real market cap. */
export function isComp(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    Number.isFinite(p.tvl_usd) &&
    p.category !== 'CEX'
  );
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
/** Round to 4 decimals: display-only figures, never an input the page recomputes from. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One comparable's mcap/TVL ratio, winsorised so a tiny-TVL outlier cannot set a price. */
function ratioOf(p: SnapshotProtocol, model: ModelConstants): number {
  return clamp((p.mcap_usd ?? 0) / p.tvl_usd, model.ratio_lo, model.ratio_hi);
}

/**
 * The valuation fit: the global median ratio, the shrunk multiple per category, and the log-log
 * least-squares fit of market cap on TVL. `exclude` leaves one protocol out (the held-out run).
 */
export interface Fit {
  a: number;
  b: number;
  n: number;
  globalMedian: number;
  multiples: Map<string, number>;
}

export function fitModel(protocols: SnapshotProtocol[], model: ModelConstants, exclude: string | null = null): Fit {
  const comps = protocols.filter((p) => isComp(p) && p.slug !== exclude);
  const ratios = comps.map((p) => ratioOf(p, model));
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratioOf(p, model));
    byCategory.set(key, list);
  }
  const multiples = new Map<string, number>();
  for (const [category, values] of byCategory) {
    const m = median(values);
    const shrunk = (values.length * m + model.shrink_k * globalMedian) / (values.length + model.shrink_k);
    multiples.set(category, clamp(shrunk, model.multiple_lo, model.multiple_hi));
  }
  // Ordinary least squares on log(TVL) -> log(mcap).
  let a = Math.log(0.25);
  let b = 1;
  if (comps.length >= 2) {
    const xs = comps.map((p) => Math.log(p.tvl_usd));
    const ys = comps.map((p) => Math.log(p.mcap_usd ?? 1));
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) * (xs[i]! - mx);
    }
    if (sxx > 0) {
      b = sxy / sxx;
      a = my - b * mx;
    }
  }
  return { a, b, n: comps.length, globalMedian, multiples };
}

/** A category's tilt: how its multiple compares with the market's, dampened to a quarter power. */
function tiltFor(category: string | null, fit: Fit, model: ModelConstants): number {
  const multiple = fit.multiples.get(category ?? 'Other');
  if (multiple === undefined) return 1;
  return clamp(Math.pow(multiple / fit.globalMedian, model.tilt_power), model.tilt_lo, model.tilt_hi);
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: Fit,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; categoryMultiple: number; tilt: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMultiple = fit.multiples.get(protocol.category ?? 'Other') ?? fit.globalMedian;
  const tilt = tiltFor(protocol.category, fit, model);
  const base = protocol.tvl_usd > 0 ? Math.exp(fit.a) * Math.pow(protocol.tvl_usd, fit.b) : 0;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * tilt));
  return { implied, base, growthPct, growthMult, maturityMult, categoryMultiple, tilt, age };
}

/** The flat 0.25 x TVL baseline the validation compares the model against. */
function baselineValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): number {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return Math.max(1, Math.round(protocol.tvl_usd * 0.25 * growthMult * maturityMult));
}

/** Ordinal ranks of `values`, ties broken by the matching `slugs`, for the Spearman correlation. */
function ranks(values: number[], slugs: string[]): number[] {
  const order = values.map((_, i) => i).sort((i, j) => values[i]! - values[j]! || (slugs[i]! < slugs[j]! ? -1 : slugs[i]! > slugs[j]! ? 1 : 0));
  const out = new Array<number>(values.length);
  for (let rank = 0; rank < order.length; rank++) out[order[rank]!] = rank;
  return out;
}

/** Spearman's rank correlation between two lists, in the same order. */
function spearman(predicted: number[], actual: number[], slugs: string[]): number {
  const n = predicted.length;
  if (n < 2) return 0;
  const rp = ranks(predicted, slugs);
  const ra = ranks(actual, slugs);
  const mp = rp.reduce((s, x) => s + x, 0) / n;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let vp = 0;
  let va = 0;
  for (let i = 0; i < n; i++) {
    cov += (rp[i]! - mp) * (ra[i]! - ma);
    vp += (rp[i]! - mp) * (rp[i]! - mp);
    va += (ra[i]! - ma) * (ra[i]! - ma);
  }
  if (vp === 0 || va === 0) return 0;
  return cov / Math.sqrt(vp * va);
}

/**
 * The held-out validation: each live-token protocol is scored with a fit rebuilt without it, and
 * the prediction is compared with its real market cap. The same is done for the flat baseline.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const comps = snapshot.protocols.filter((p) => isComp(p)).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const errors: number[] = [];
  const baselineErrors: number[] = [];
  let within2 = 0;
  let baselineWithin2 = 0;
  const predicted: number[] = [];
  const baselinePredicted: number[] = [];
  const actual: number[] = [];
  const slugs: string[] = [];
  for (const p of comps) {
    const fit = fitModel(snapshot.protocols, model, p.slug);
    const v = impliedValue(p, snapshot.as_of, fit, model);
    const bv = baselineValue(p, snapshot.as_of, model);
    const real = p.mcap_usd ?? 1;
    errors.push(Math.abs(v.implied - real) / real);
    baselineErrors.push(Math.abs(bv - real) / real);
    if (v.implied / real >= 0.5 && v.implied / real <= 2) within2++;
    if (bv / real >= 0.5 && bv / real <= 2) baselineWithin2++;
    predicted.push(v.implied);
    baselinePredicted.push(bv);
    actual.push(real);
    slugs.push(p.slug);
  }
  const n = comps.length;
  return {
    comps: n,
    mdape: n > 0 ? round4(median(errors)) : 0,
    within2: n > 0 ? round4(within2 / n) : 0,
    spearman: round4(spearman(predicted, actual, slugs)),
    baseline_mdape: n > 0 ? round4(median(baselineErrors)) : 0,
    baseline_within2: n > 0 ? round4(baselineWithin2 / n) : 0,
    baseline_spearman: round4(spearman(baselinePredicted, actual, slugs)),
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitModel(snapshot.protocols, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. The floor is never the
  // whole board, and a protocol below it is no worse a subject than one on it.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_value: Math.round(s.base),
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      category_multiple: s.categoryMultiple,
      category_tilt: s.tilt,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

const L2_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon', 'Unichain', 'Ink', 'Scroll', 'Blast', 'Linea',
  'Mode', 'Zora', 'World Chain', 'Katana', 'Arc', 'Stable', 'Tempo', 'Monad', 'Sonic', 'Berachain',
  'BOB', 'Corn', 'Plasma', 'Hyperliquid L1', 'Robinhood Chain',
]);

/** What one transaction costs on the protocol's first chain, in the words a farmer can budget. */
function gasFor(p: SnapshotProtocol): string {
  const chain = chainOf(p);
  if (chain === 'Ethereum') return 'about $5 to $15 of gas per transaction';
  if (chain === 'Solana') return 'a few cents of gas per transaction';
  if (L2_CHAINS.has(chain)) return 'under $1 of gas per transaction';
  return 'a few dollars of gas per transaction';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote when a proposal opens.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain}.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and use its native app once a week.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second action: a different leg of the same protocol, so the farm is not one click. */
function secondActionFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the supply, then repay it the same week, so the position shows both sides of the market.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add a second, smaller position of about $${small} in another pool of ${name} and keep both open.`;
  if (c.includes('bridge')) return `Use the bridged funds inside one app on the destination chain, then bridge a small amount back.`;
  if (c.includes('staking') || c.includes('restak')) return `Use the staking receipt token in one DeFi position on the same chain, such as a lending market.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close the hedge and open a fresh one the following week to keep the position active.`;
  if (c.includes('prediction')) return `Place a second small position of about $${small} on a different market the same week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move a small share of about $${small} into a second vault of ${name} and keep both.`;
  if (c.includes('stable')) return `Mint a small amount of about $${small} of the stable asset against the deposit and hold it.`;
  if (c.includes('rwa')) return `Reinvest the yield the position pays into the same asset once it arrives.`;
  if (c.includes('insurance')) return `Buy a second small cover of about $${small} on a different pool and keep both policies.`;
  if (c.includes('governance')) return `Vote in the next proposal when it opens and keep the voting receipt.`;
  if (c.includes('payment')) return `Make one more payment of about $${small} through ${name} the following week.`;
  if (c.includes('chain')) return `Use the chain's native app once more that week, such as a swap or a transfer.`;
  return `Make one more qualifying action the following week, such as a deposit, a swap or a vote.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL and age), never from a hand-written list
 * of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gas,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: gas,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind slowly: withdraw in parts and watch the fees and slippage on each one.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, days to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The per-category comparables table, most comps first. */
export function compRows(snapshot: Snapshot, model: ModelConstants = MODEL): CompRow[] {
  const fit = fitModel(snapshot.protocols, model);
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (!isComp(p)) continue;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratioOf(p, model));
    byCategory.set(key, list);
  }
  const rows: CompRow[] = [];
  for (const [category, multiple] of fit.multiples) {
    const values = byCategory.get(category) ?? [];
    const rawMedian = values.length > 0 ? median(values) : multiple;
    const tilt = clamp(Math.pow(multiple / fit.globalMedian, model.tilt_power), model.tilt_lo, model.tilt_hi);
    rows.push({ category, comps: values.length, median_ratio: rawMedian, multiple, tilt });
  }
  rows.sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return rows;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_tilt: row.model.category_tilt,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const fit = fitModel(snapshot.protocols, model);
  const validation = validateModel(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit: { a: fit.a, b: fit.b, n: fit.n, global_median: fit.globalMedian },
    validation,
    comps: compRows(snapshot, model),
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
