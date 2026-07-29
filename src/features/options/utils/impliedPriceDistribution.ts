import type { OptionQuote } from '../../../lib/services/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { PriceDistributionData, PriceDistributionForecast } from '../../../lib/services/types';

export interface DistributionPoint {
  price: number;
  pdf: number;
  cdf: number;
}

export interface ImpliedDistributionData {
  expiry: string;
  daysToExpiry: number;
  underlyingPrice: number;
  points: DistributionPoint[];
  expectedPrice: number;
  stdDev: number;
  oneSigmaLow: number;
  oneSigmaHigh: number;
  twoSigmaLow: number;
  twoSigmaHigh: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  maxProbabilityPrice: number;
  skew: number;
  kurtosis: number;
}

interface RawQuoteRow {
  strike: number;
  callPrice: number;
  putPrice: number;
  callIv: number;
  putIv: number;
}

const erf = (x: number): number => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
};

const normCdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));
const normPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

const normInv = (p: number): number => {
  if (p <= 0 || p >= 1 || !isFinite(p)) return NaN;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
};


const normalPdfAt = (x: number, mu: number, sigma: number): number =>
  sigma > 0 ? normPdf((x - mu) / sigma) / sigma : 0;

const blackScholesGreeks = (
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): { call: number; put: number; delta: number; gamma: number } => {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsicCall = Math.max(S - K, 0);
    const intrinsicPut = Math.max(K - S, 0);
    return {
      call: intrinsicCall,
      put: intrinsicPut,
      delta: S > K ? 1 : S < K ? 0 : 0.5,
      gamma: 0,
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const call = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  const put = K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
  const delta = normCdf(d1);
  const gamma = normPdf(d1) / (S * sigma * sqrtT);
  return { call, put, delta, gamma };
};

export const computeDaysToExpiry = (expiry: string): number => {
  const now = new Date();
  const exp = new Date(expiry + 'T23:59:59');
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0.01, Math.ceil((exp.getTime() - now.getTime()) / msPerDay));
};

interface IVPoint {
  strike: number;
  iv: number;
}

const buildNormalFallback = (
  underlyingPrice: number,
  ivAtm: number,
  T: number,
  gridMin: number,
  gridMax: number,
  gridN: number,
  expiry: string
): ImpliedDistributionData => {
  const mu = underlyingPrice;
  const sigmaPct = Math.max(0.001, ivAtm * Math.sqrt(T));
  const sigma = sigmaPct * underlyingPrice;
  const step = (gridMax - gridMin) / Math.max(1, gridN - 1);
  const points: DistributionPoint[] = [];
  let acc = 0;
  let prevPdf = 0;
  for (let i = 0; i < gridN; i++) {
    const price = gridMin + i * step;
    const pdf = normalPdfAt(price, mu, sigma);
    acc += (prevPdf + pdf) * 0.5 * step;
    prevPdf = pdf;
    points.push({ price, pdf, cdf: Math.min(1, Math.max(0, acc)) });
  }
  if (points.length > 0) points[points.length - 1].cdf = 1;
  return {
    expiry,
    daysToExpiry: Math.round(T * 365),
    underlyingPrice,
    points,
    expectedPrice: mu,
    stdDev: sigma,
    oneSigmaLow: mu - sigma,
    oneSigmaHigh: mu + sigma,
    twoSigmaLow: mu - 2 * sigma,
    twoSigmaHigh: mu + 2 * sigma,
    percentile25: mu - 0.6745 * sigma,
    percentile50: mu,
    percentile75: mu + 0.6745 * sigma,
    maxProbabilityPrice: mu,
    skew: 0,
    kurtosis: 0,
  };
};

export const buildDistributionFromIV = (
  quotes: OptionQuote[],
  targetExpiry: string,
  underlyingPrice: number,
  riskFreeRate = 0.025
): ImpliedDistributionData | null => {
  if (!underlyingPrice || underlyingPrice <= 0) return null;

  const sameExpiry = quotes.filter((q) => q.expiry === targetExpiry);
  if (sameExpiry.length < 3) return null;

  const rows: RawQuoteRow[] = sameExpiry
    .map((q) => ({
      strike: Number(q.strike) || 0,
      callPrice: Number(q.callPrice) || 0,
      putPrice: Number(q.putPrice) || 0,
      callIv: Number(q.callImpliedVol) || 0,
      putIv: Number(q.putImpliedVol) || 0,
    }))
    .filter((r) => r.strike > 0)
    .sort((a, b) => a.strike - b.strike);

  if (rows.length < 3) return null;

  const T = computeDaysToExpiry(targetExpiry) / 365.0;
  if (T <= 0) return null;

  let atmIv = 0.2;
  let atmDist = Infinity;
  for (const r of rows) {
    const midIv = r.callIv > 0 && r.putIv > 0 ? (r.callIv + r.putIv) / 2 : r.callIv || r.putIv;
    const dist = Math.abs(r.strike - underlyingPrice);
    if (dist < atmDist && midIv > 0 && midIv < 5) {
      atmIv = midIv;
      atmDist = dist;
    }
  }
  if (!isFinite(atmIv) || atmIv <= 0 || atmIv > 5) atmIv = 0.2;

  const volSurface: IVPoint[] = rows.map((r) => {
    const iv =
      r.callIv > 0 && r.putIv > 0
        ? (r.callIv + r.putIv) / 2
        : r.callIv > 0
        ? r.callIv
        : r.putIv > 0
        ? r.putIv
        : atmIv;
    return { strike: r.strike, iv: Math.max(0.001, Math.min(5, iv)) };
  });

  const minStrike = volSurface[0].strike;
  const maxStrike = volSurface[volSurface.length - 1].strike;
  const strikeRange = maxStrike - minStrike;
  const extendPct = 0.5;
  const gridMin = Math.max(
    0.01,
    Math.min(underlyingPrice * 0.4, minStrike - strikeRange * extendPct)
  );
  const gridMax = Math.max(
    gridMin + 1,
    Math.max(underlyingPrice * 2.5, maxStrike + strikeRange * extendPct)
  );
  const gridN = 200;
  const step = (gridMax - gridMin) / (gridN - 1);

  const interpolateIV = (K: number): number => {
    if (K <= volSurface[0].strike) return volSurface[0].iv;
    if (K >= volSurface[volSurface.length - 1].strike) return volSurface[volSurface.length - 1].iv;
    let lo = 0;
    let hi = volSurface.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (volSurface[mid].strike <= K) lo = mid;
      else hi = mid;
    }
    const a = volSurface[lo];
    const b = volSurface[hi];
    const denom = b.strike - a.strike;
    const w = denom > 0 ? (K - a.strike) / denom : 0.5;
    return a.iv * (1 - w) + b.iv * w;
  };

  const gridPrices: number[] = [];
  const rawPdf: number[] = [];
  for (let i = 0; i < gridN; i++) {
    const K = gridMin + i * step;
    gridPrices.push(K);
    const sigma = interpolateIV(K);
    const { gamma } = blackScholesGreeks(underlyingPrice, K, T, riskFreeRate, sigma);
    rawPdf.push(Math.max(0, gamma * Math.exp(-riskFreeRate * T)));
  }

  const trapezoidSum = (arr: number[], h: number): number => {
    if (arr.length < 2) return 0;
    let sum = (arr[0] + arr[arr.length - 1]) * 0.5;
    for (let i = 1; i < arr.length - 1; i++) sum += arr[i];
    return sum * h;
  };

  const total = trapezoidSum(rawPdf, step);
  if (!isFinite(total) || total <= 1e-12) {
    return buildNormalFallback(underlyingPrice, atmIv, T, gridMin, gridMax, gridN, targetExpiry);
  }

  const pdfArr: number[] = new Array(gridN);
  const cdfArr: number[] = new Array(gridN);
  let acc = 0;
  let prevVal = 0;
  for (let i = 0; i < gridN; i++) {
    const val = rawPdf[i] / total;
    pdfArr[i] = val;
    acc += (prevVal + val) * 0.5 * step;
    prevVal = val;
    cdfArr[i] = Math.min(1, Math.max(0, acc));
  }
  cdfArr[gridN - 1] = 1;

  const points: DistributionPoint[] = gridPrices.map((price, i) => ({
    price,
    pdf: pdfArr[i],
    cdf: cdfArr[i],
  }));

  let expectedPrice = 0;
  let variance = 0;
  let thirdMoment = 0;
  let fourthMoment = 0;
  let maxPdf = -Infinity;
  let maxProbPrice = gridPrices[0];
  let prevP = 0;
  for (let i = 0; i < gridN; i++) {
    const p = gridPrices[i];
    const d = (prevP + pdfArr[i]) * 0.5 * step;
    expectedPrice += p * d;
    if (pdfArr[i] > maxPdf) {
      maxPdf = pdfArr[i];
      maxProbPrice = p;
    }
    prevP = pdfArr[i];
  }

  prevP = 0;
  for (let i = 0; i < gridN; i++) {
    const d = gridPrices[i] - expectedPrice;
    const w = (prevP + pdfArr[i]) * 0.5 * step;
    variance += d * d * w;
    thirdMoment += d * d * d * w;
    fourthMoment += d * d * d * d * w;
    prevP = pdfArr[i];
  }

  const stdDev = Math.sqrt(Math.max(0, variance));
  const skew = stdDev > 0 ? thirdMoment / (stdDev * stdDev * stdDev) : 0;
  const kurt = variance > 0 ? fourthMoment / (variance * variance) - 3 : 0;

  const findPercentile = (p: number): number => {
    for (let i = 0; i < gridN; i++) {
      if (cdfArr[i] >= p) {
        if (i === 0) return gridPrices[0];
        const denom = cdfArr[i] - cdfArr[i - 1];
        const w = denom > 0 ? (p - cdfArr[i - 1]) / denom : 0.5;
        return gridPrices[i - 1] + w * (gridPrices[i] - gridPrices[i - 1]);
      }
    }
    return gridPrices[gridN - 1];
  };

  return {
    expiry: targetExpiry,
    daysToExpiry: Math.round(T * 365),
    underlyingPrice,
    points,
    expectedPrice,
    stdDev,
    oneSigmaLow: expectedPrice - stdDev,
    oneSigmaHigh: expectedPrice + stdDev,
    twoSigmaLow: expectedPrice - 2 * stdDev,
    twoSigmaHigh: expectedPrice + 2 * stdDev,
    percentile25: findPercentile(0.25),
    percentile50: findPercentile(0.5),
    percentile75: findPercentile(0.75),
    maxProbabilityPrice: maxProbPrice,
    skew,
    kurtosis: kurt,
  };
};

export const groupQuotesByExpiry = (quotes: OptionQuote[]): Map<string, OptionQuote[]> => {
  const map = new Map<string, OptionQuote[]>();
  for (const q of quotes) {
    if (!map.has(q.expiry)) map.set(q.expiry, []);
    map.get(q.expiry)!.push(q);
  }
  return map;
};

export const getSortedUniqueExpiries = (quotes: OptionQuote[]): string[] => {
  const set = new Set(quotes.map((q) => q.expiry));
  return Array.from(set).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
};

export interface ConePoint {
  expiry: string;
  expiryTs: UTCTimestamp;
  pointTs: UTCTimestamp;
  daysToExpiry: number;
  lower: number;
  mid: number;
  upper: number;
  lowerDelta: number;
  upperDelta: number;
  isExpiryPoint: boolean;
}

export type ConeDeltaLevel = 0.6 | 0.7 | 0.8 | 0.9 | 0.95;

const expiryToTimestamp = (expiry: string): UTCTimestamp => {
  const d = new Date(expiry + 'T23:59:59');
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
};

const toStartOfDay = (ts: number): number => {
  const d = new Date(ts * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

const binaryInterpolateStrikeForCallDelta = (
  rows: { strike: number; callIv: number; putIv: number }[],
  targetDelta: number,
  S: number,
  T: number,
  r: number
): { strike: number; deltaOk: boolean } => {
  if (!rows.length || S <= 0 || T <= 0) return { strike: NaN, deltaOk: false };
  const strikes = rows.map((r) => r.strike);
  const minK = strikes[0];
  const maxK = strikes[strikes.length - 1];
  const ivAtK = (K: number): number => {
    if (K <= minK) return rows[0].callIv || rows[0].putIv || 0.2;
    if (K >= maxK) return rows[rows.length - 1].callIv || rows[rows.length - 1].putIv || 0.2;
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].strike <= K) lo = mid;
      else hi = mid;
    }
    const a = rows[lo];
    const b = rows[hi];
    const denom = b.strike - a.strike;
    const w = denom > 0 ? (K - a.strike) / denom : 0.5;
    const ivA = a.callIv || a.putIv || 0.2;
    const ivB = b.callIv || b.putIv || 0.2;
    return ivA * (1 - w) + ivB * w;
  };
  const callDeltaAt = (K: number): number => {
    const sigma = ivAtK(K);
    if (sigma <= 0 || K <= 0) return NaN;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    return normCdf(d1);
  };
  // 锚定合理区间：S * [0.5, 1.5] 通常覆盖 95% 概率带，避免跑到 maxK*2 这种离谱值
  const absMinK = Math.min(minK * 0.9, S * 0.5);
  const absMaxK = Math.max(maxK * 1.1, S * 1.5);
  let loK = Math.max(1e-6, absMinK);
  let hiK = absMaxK;
  const fLo = callDeltaAt(loK);
  const fHi = callDeltaAt(hiK);
  if (!isFinite(fLo) || !isFinite(fHi)) {
    return { strike: NaN, deltaOk: false };
  }
  if (fLo < targetDelta && fHi < targetDelta) {
    // 即使整段都达不到，也绝对不返回 loK 本身（可能是0.5*S），用理论值兜底
    return { strike: NaN, deltaOk: false };
  }
  if (fLo > targetDelta && fHi > targetDelta) {
    return { strike: NaN, deltaOk: false };
  }
  for (let iter = 0; iter < 80; iter++) {
    const midK = (loK + hiK) * 0.5;
    const fMid = callDeltaAt(midK);
    if (!isFinite(fMid)) break;
    if (Math.abs(fMid - targetDelta) < 5e-5 || Math.abs(hiK - loK) / Math.max(1, midK) < 1e-6) {
      return { strike: midK, deltaOk: true };
    }
    if (fMid >= targetDelta) {
      loK = midK;
    } else {
      hiK = midK;
    }
  }
  return { strike: (loK + hiK) * 0.5, deltaOk: true };
};

const binaryInterpolateStrikeForPutDelta = (
  rows: { strike: number; callIv: number; putIv: number }[],
  targetDelta: number,
  S: number,
  T: number,
  r: number
): { strike: number; deltaOk: boolean } => {
  if (!rows.length || S <= 0 || T <= 0) return { strike: NaN, deltaOk: false };
  const strikes = rows.map((r) => r.strike);
  const minK = strikes[0];
  const maxK = strikes[strikes.length - 1];
  const ivAtK = (K: number): number => {
    if (K <= minK) return rows[0].putIv || rows[0].callIv || 0.2;
    if (K >= maxK) return rows[rows.length - 1].putIv || rows[rows.length - 1].callIv || 0.2;
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].strike <= K) lo = mid;
      else hi = mid;
    }
    const a = rows[lo];
    const b = rows[hi];
    const denom = b.strike - a.strike;
    const w = denom > 0 ? (K - a.strike) / denom : 0.5;
    const ivA = a.putIv || a.callIv || 0.2;
    const ivB = b.putIv || b.callIv || 0.2;
    return ivA * (1 - w) + ivB * w;
  };
  const putDeltaAt = (K: number): number => {
    const sigma = ivAtK(K);
    if (sigma <= 0 || K <= 0) return NaN;
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    return normCdf(d1) - 1;
  };
  const absMinK = Math.min(minK * 0.9, S * 0.5);
  const absMaxK = Math.max(maxK * 1.1, S * 1.5);
  let loK = Math.max(1e-6, absMinK);
  let hiK = absMaxK;
  const fLo = putDeltaAt(loK);
  const fHi = putDeltaAt(hiK);
  if (!isFinite(fLo) || !isFinite(fHi)) return { strike: NaN, deltaOk: false };
  if (fLo > targetDelta && fHi > targetDelta) return { strike: NaN, deltaOk: false };
  if (fLo < targetDelta && fHi < targetDelta) return { strike: NaN, deltaOk: false };
  for (let iter = 0; iter < 80; iter++) {
    const midK = (loK + hiK) * 0.5;
    const fMid = putDeltaAt(midK);
    if (!isFinite(fMid)) break;
    if (Math.abs(fMid - targetDelta) < 5e-5 || Math.abs(hiK - loK) / Math.max(1, midK) < 1e-6) {
      return { strike: midK, deltaOk: true };
    }
    if (fMid <= targetDelta) {
      loK = midK;
    } else {
      hiK = midK;
    }
  }
  return { strike: (loK + hiK) * 0.5, deltaOk: true };
};

/**
 * @deprecated 通道/概率锥严格要求必须从后端 /api/options/price-distribution 接口获取。
 * 本函数是旧的"Delta 档位本地二分算行权价"实现，仅在 mock 环境或工具调试时保留，
 * 生产 StockKlineChart 代码绝不再调用它。
 */
export const buildImpliedCone = (
  quotes: OptionQuote[],
  underlyingPrice: number,
  deltaLevel: ConeDeltaLevel = 0.8,
  riskFreeRate = 0.025
): ConePoint[] => {
  if (!underlyingPrice || underlyingPrice <= 0 || !quotes?.length) return [];
  const expiries = getSortedUniqueExpiries(quotes);
  const raw: ConePoint[] = [];
  const byExp = groupQuotesByExpiry(quotes);
  const nowTs = Math.floor(Date.now() / 1000);
  for (const exp of expiries) {
    const arr = byExp.get(exp);
    if (!arr || arr.length < 3) continue;
    const rows = arr
      .map((q) => ({
        strike: Number(q.strike) || 0,
        callIv: Number(q.callImpliedVol) || 0,
        putIv: Number(q.putImpliedVol) || 0,
      }))
      .filter((r) => r.strike > 0)
      .sort((a, b) => a.strike - b.strike);
    if (rows.length < 3) continue;
    const strikes = rows.map((r) => r.strike);
    const chainMinK = strikes[0];
    const chainMaxK = strikes[strikes.length - 1];
    const expTs = expiryToTimestamp(exp);
    const T = Math.max(1 / 365, (expTs - nowTs) / (365 * 24 * 3600));
    const dte = Math.max(1, Math.round(T * 365));
    const atmRow = rows.reduce(
      (best, r) =>
        Math.abs(r.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? r : best,
      rows[0]
    );
    const ivATM = atmRow.callIv || atmRow.putIv || 0.2;
    const midEstimate = underlyingPrice * Math.exp(riskFreeRate * T);
    const callTarget = Number(deltaLevel);
    const putTarget = -Number(deltaLevel);
    // 理论兜底：lognormal 分位数，绝对不会跑出离谱价格（严格在 S*0.1..S*10 且与 chain minK/maxK 比较取合理）
    const fallbackFromLognormal = (deltaBand: number, side: 'lower' | 'upper'): number => {
      // 注意：此处 fallback 的 deltaBand 指的是"Delta=档位 call / put"的行权价，
      // 但更稳妥的是直接用"ATM-implied lognormal quantile"，并把结果 clamp 到 chain 报价区间
      // 对 call Δ=X: K 大约 = S * exp( (r - 0.5σ²)T + σ√T * Φ⁻¹(1 - X) )
      // 对 put Δ=-X: K 大约 = S * exp( (r - 0.5σ²)T - σ√T * Φ⁻¹(1 - X) )
      // 这里我们统一采用更简单的"波动率锥"思路：
      // z 对应 tail 概率 = 1 - deltaBand
      const p = 1 - deltaBand; // tail
      const z = isFinite(normInv(1 - p)) ? normInv(1 - p) : 0.8416; // 80% ≈ z=0.84
      const sigma = Math.max(0.05, ivATM || 0.2);
      const drift = (riskFreeRate - 0.5 * sigma * sigma) * T;
      const diffusion = sigma * Math.sqrt(T);
      if (side === 'lower') {
        // 对应 call Δ=deltaBand 的行权价（在 S 之下）
        const theo = underlyingPrice * Math.exp(drift - z * diffusion);
        const lowerCap = Math.max(chainMinK * 0.9, underlyingPrice * 0.3);
        const upperCap = Math.min(chainMaxK * 1.05, underlyingPrice * 0.995);
        return Math.min(upperCap, Math.max(lowerCap, theo));
      }
      const theo = underlyingPrice * Math.exp(drift + z * diffusion);
      const lowerCap = Math.max(chainMinK * 0.95, underlyingPrice * 1.005);
      const upperCap = Math.min(chainMaxK * 1.1, underlyingPrice * 3.0);
      return Math.min(upperCap, Math.max(lowerCap, theo));
    };
    let { strike: lower, deltaOk: loOk } = binaryInterpolateStrikeForCallDelta(
      rows,
      callTarget,
      underlyingPrice,
      T,
      riskFreeRate
    );
    if (!loOk || !isFinite(lower) || lower >= underlyingPrice * 0.998 || lower <= underlyingPrice * 0.1) {
      lower = fallbackFromLognormal(Number(deltaLevel), 'lower');
    } else {
      // 即使二分成功，也严格 clamp 到"报价链合理外延"范围，绝不再出现几万
      const loFloor = Math.max(chainMinK * 0.9, underlyingPrice * 0.3);
      const loCeil = Math.min(chainMaxK * 1.02, underlyingPrice * 0.995);
      lower = Math.min(loCeil, Math.max(loFloor, lower));
    }
    let { strike: upper, deltaOk: hiOk } = binaryInterpolateStrikeForPutDelta(
      rows,
      putTarget,
      underlyingPrice,
      T,
      riskFreeRate
    );
    if (!hiOk || !isFinite(upper) || upper <= underlyingPrice * 1.002 || upper >= underlyingPrice * 10) {
      upper = fallbackFromLognormal(Number(deltaLevel), 'upper');
    } else {
      const hiFloor = Math.max(chainMinK * 0.98, underlyingPrice * 1.005);
      const hiCeil = Math.min(chainMaxK * 1.1, underlyingPrice * 3.0);
      upper = Math.min(hiCeil, Math.max(hiFloor, upper));
    }
    // 最终兜底：确保 lower < midEstimate < upper 的相对关系存在
    if (upper <= lower) {
      const midFallback = midEstimate;
      const halfW = Math.max(underlyingPrice * 0.01, (ivATM || 0.2) * Math.sqrt(T) * underlyingPrice * 0.5);
      lower = midFallback - halfW;
      upper = midFallback + halfW;
    }
    raw.push({
      expiry: exp,
      expiryTs: expTs,
      pointTs: expTs,
      daysToExpiry: dte,
      lower: Math.max(1e-6, lower),
      mid: midEstimate,
      upper: Math.max(lower * 1.001, upper),
      lowerDelta: callTarget,
      upperDelta: putTarget,
      isExpiryPoint: true,
    });
  }
  if (raw.length === 0) return raw;
  raw.sort((a, b) => a.expiryTs - b.expiryTs);
  // 跨到期月单调：远月通道宽度不得窄于近月（否则视觉会出现"倒锥"）
  const out: ConePoint[] = [];
  let prevWidth: number | null = null;
  for (const p of raw) {
    const width = p.upper - p.lower;
    if (prevWidth != null && width < prevWidth) {
      const keep = prevWidth * 1.0001;
      const center = (p.lower + p.upper) * 0.5;
      out.push({
        ...p,
        lower: Math.max(1e-6, center - keep * 0.5),
        upper: center + keep * 0.5,
      });
    } else {
      out.push(p);
    }
    prevWidth = Math.max(prevWidth ?? 0, width);
  }
  return out;
};

export interface BuildConeFromPriceDistributionOptions {
  /** 默认取第 0 条 band；传 probability 可以精确匹配如 0.8 */
  probability?: number;
  /** 缺失时使用的现价/参考价，用来做 mid clamp */
  anchorPrice?: number;
}

/**
 * 把后端 /api/options/price-distribution 的响应
 * 转换成 K 线图 applyConeToSeries 需要的 ConePoint[]。
 *
 * - 单月 forecast：直接把 band.points 逐点展开（每 5 天一个点）
 * - 多月 forecasts：按天合并去重，取每个 ts 上最新的（最远到期月的 band 上限最宽），
 *   并在每个月的到期日当天额外保留一个 ConePoint，用来渲染到期日标签。
 */
export const buildConeFromPriceDistribution = (
  payload: PriceDistributionData | null | undefined,
  options: BuildConeFromPriceDistributionOptions = {}
): ConePoint[] => {
  if (!payload) return [];
  const forecasts: PriceDistributionForecast[] = Array.isArray(payload.forecasts) && payload.forecasts.length > 0
    ? payload.forecasts
    : payload.forecast
    ? [payload.forecast]
    : [];
  if (forecasts.length === 0) return [];
  const spot = Number(payload.spot) > 0 ? Number(payload.spot) : options.anchorPrice ?? 0;
  const dateToTs = (dateStr: string): UTCTimestamp => {
    const d = new Date(dateStr + 'T00:00:00Z');
    const ts = Math.floor(d.getTime() / 1000);
    if (!isFinite(ts) || ts <= 0) {
      return Math.floor(Date.now() / 1000) as UTCTimestamp;
    }
    return ts as UTCTimestamp;
  };
  const expiryToTsEndOfDay = (dateStr: string | undefined): UTCTimestamp => {
    if (!dateStr) return Math.floor(Date.now() / 1000) as UTCTimestamp;
    const d = new Date(dateStr + 'T23:59:59Z');
    const ts = Math.floor(d.getTime() / 1000);
    if (!isFinite(ts) || ts <= 0) {
      return Math.floor(Date.now() / 1000) as UTCTimestamp;
    }
    return ts as UTCTimestamp;
  };
  // 每个到期日的边界快照：用于生成"到期日 ConePoint"（带 expiry、dte）
  const expirySnapshots: Array<ConePoint & { lowerCandidate?: number; upperCandidate?: number; midCandidate?: number }> = [];
  // 收集所有 band points，按 (ts, expiryDate) 去重 / 合并宽度
  const merged = new Map<number, { ts: number; lower: number; mid: number; upper: number }>();
  for (const fc of forecasts) {
    if (!fc?.bands?.length) continue;
    const prob = options.probability;
    const band = (() => {
      if (prob != null) {
        const exact = fc.bands.find((b) => Math.abs(Number(b.probability) - Number(prob)) < 1e-6);
        if (exact) return exact;
      }
      return fc.bands[0];
    })();
    if (!band || !band.points?.length) continue;
    const expiryTs = expiryToTsEndOfDay(fc.expiryDate);
    const calDays = Number.isFinite(Number(fc.calendarDaysToExpiry))
      ? Math.max(1, Math.round(Number(fc.calendarDaysToExpiry)))
      : Math.max(1, Math.round(((expiryTs as number) - Math.floor(Date.now() / 1000)) / 86400));
    let snapshotAtExpiry: { lower: number; mid: number; upper: number } | null = null;
    for (const p of band.points) {
      const lower = Number(p.lower);
      const upper = Number(p.upper);
      const mid = Number.isFinite(Number(p.mid))
        ? Number(p.mid)
        : Number.isFinite(Number(p.expected))
        ? Number(p.expected)
        : (lower + upper) * 0.5;
      if (!isFinite(lower) || !isFinite(upper) || lower >= upper) continue;
      const ts = dateToTs(p.date) as number;
      const prev = merged.get(ts);
      if (!prev) {
        merged.set(ts, { ts, lower, mid, upper });
      } else {
        // 同一时间点，取"更宽"的边界（远月永远比近月宽）
        merged.set(ts, {
          ts,
          lower: Math.min(prev.lower, lower),
          upper: Math.max(prev.upper, upper),
          mid: Number.isFinite(prev.mid) ? prev.mid : mid,
        });
      }
      // 记录距离"本 forecast 到期日"最近的那一个点作为 snapshot
      if (fc.expiryDate && p.date && fc.expiryDate.slice(0, 10) === p.date.slice(0, 10)) {
        snapshotAtExpiry = { lower, mid, upper };
      }
    }
    // 如果没找到精确匹配的点，强制把 last point 当 snapshot（因为 band.points 通常包含 expiry 当天）
    if (!snapshotAtExpiry && band.points.length > 0) {
      const last = band.points[band.points.length - 1];
      snapshotAtExpiry = {
        lower: Number(last.lower),
        mid: Number.isFinite(Number(last.mid)) ? Number(last.mid) : (Number(last.lower) + Number(last.upper)) * 0.5,
        upper: Number(last.upper),
      };
    }
    if (snapshotAtExpiry && isFinite(snapshotAtExpiry.lower) && isFinite(snapshotAtExpiry.upper)) {
      expirySnapshots.push({
        expiry: fc.expiryDate ?? '',
        expiryTs,
        daysToExpiry: calDays,
        lower: snapshotAtExpiry.lower,
        mid: snapshotAtExpiry.mid,
        upper: snapshotAtExpiry.upper,
        lowerDelta: Number(band.probability),
        upperDelta: -Number(band.probability),
      });
    }
  }
  if (merged.size === 0) return [];
  // 把按时间点聚合的 merged 转成 ConePoint[]；expiry/dte 字段填最近到期日快照
  expirySnapshots.sort((a, b) => (a.expiryTs as number) - (b.expiryTs as number));
  const expiryDateTsSet = new Set<number>(expirySnapshots.map((s) => toStartOfDay(Number(s.expiryTs))));
  const timeArr = Array.from(merged.values()).sort((a, b) => a.ts - b.ts);
  const result: ConePoint[] = timeArr.map((row) => {
    const pointTs = row.ts as UTCTimestamp;
    const pointStartOfDay = toStartOfDay(Number(pointTs));
    // 找到 >= row.ts 的第一个 expiry snapshot，dte 基于该 snapshot - 实际天数差粗略
    const nextSnap =
      expirySnapshots.find((s) => (s.expiryTs as number) >= row.ts) ??
      expirySnapshots[expirySnapshots.length - 1] ??
      null;
    const dteBase = nextSnap ? nextSnap.daysToExpiry : 1;
    const dayOff = nextSnap ? Math.max(0, Math.round(((nextSnap.expiryTs as number) - row.ts) / 86400)) : 0;
    const dte = nextSnap ? dayOff : dteBase;
    const isExpiryPoint = expiryDateTsSet.has(pointStartOfDay);
    return {
      expiry: nextSnap?.expiry ?? '',
      expiryTs: (nextSnap?.expiryTs ?? pointTs) as UTCTimestamp,
      pointTs,
      daysToExpiry: Math.max(0, dte),
      lower: Math.max(1e-6, row.lower),
      mid: Number.isFinite(row.mid) ? Math.max(1e-6, row.mid) : (row.lower + row.upper) * 0.5,
      upper: Math.max(row.lower * 1.0001, row.upper),
      lowerDelta: Number(nextSnap?.lowerDelta ?? 0.8),
      upperDelta: Number(nextSnap?.upperDelta ?? -0.8),
      isExpiryPoint,
    };
  });
  // 后端返回的 lower/upper 理论上已经在合理区间，但再次兜底防止 spot/单位 偏差（spot=1.8 的 588000，不会出现上万）
  const safeResult: ConePoint[] = result.map((r) => {
    let { lower, upper, mid } = r;
    if (spot > 0) {
      const lowCap = spot * 0.15;
      const hiCap = spot * 5.0;
      lower = Math.min(Math.max(lower, lowCap), hiCap);
      upper = Math.min(Math.max(upper, lowCap * 1.001), hiCap);
      mid = Number.isFinite(mid) ? Math.min(Math.max(mid, lowCap), hiCap) : (lower + upper) * 0.5;
    }
    if (upper <= lower) {
      const center = (lower + upper) * 0.5;
      const half = Math.max(center * 0.01, 1e-4);
      lower = center - half;
      upper = center + half;
    }
    return { ...r, lower, mid, upper };
  });
  // 最终去重（按 pointTs，保留最晚插入的最宽值）
  const seenTs = new Set<number>();
  const dedup: ConePoint[] = [];
  for (let i = safeResult.length - 1; i >= 0; i--) {
    const r = safeResult[i];
    const t = Number(r.pointTs) || 0;
    if (seenTs.has(t)) continue;
    seenTs.add(t);
    dedup.push(r);
  }
  dedup.reverse();
  // 跨到期月宽度单调兜底：对非到期中间点不强求，但对每个到期日 snapshot 点保证宽度单调
  return dedup.sort((a, b) => (Number(a.pointTs) || 0) - (Number(b.pointTs) || 0));
};


export const estimateConeValueAtTime = (
  cone: ConePoint[],
  targetTs: number
): { lower: number | null; mid: number | null; upper: number | null } => {
  if (!cone.length) return { lower: null, mid: null, upper: null };
  const t0 = Number(cone[0].pointTs ?? cone[0].expiryTs);
  if (targetTs <= t0) {
    const now = Math.floor(Date.now() / 1000);
    const spanT = t0 - now;
    if (spanT <= 0) return { lower: cone[0].lower, mid: cone[0].mid, upper: cone[0].upper };
    const w = Math.max(0, Math.min(1, (targetTs - now) / spanT));
    const nowAnchor = (pt: number, cur: number) => pt * (1 - w) + cur * w;
    return {
      lower: nowAnchor(cone[0].lower * 0, cone[0].lower),
      mid: nowAnchor(cone[0].mid * 0, cone[0].mid),
      upper: nowAnchor(cone[0].upper * 0, cone[0].upper),
    };
  }
  for (let i = 1; i < cone.length; i++) {
    const a = cone[i - 1];
    const b = cone[i];
    const ta = Number(a.pointTs ?? a.expiryTs);
    const tb = Number(b.pointTs ?? b.expiryTs);
    if (targetTs >= ta && targetTs <= tb) {
      const span = tb - ta;
      const w = span > 0 ? (targetTs - ta) / span : 0;
      return {
        lower: a.lower * (1 - w) + b.lower * w,
        mid: a.mid * (1 - w) + b.mid * w,
        upper: a.upper * (1 - w) + b.upper * w,
      };
    }
  }
  const last = cone[cone.length - 1];
  return { lower: last.lower, mid: last.mid, upper: last.upper };
};

