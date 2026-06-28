export interface PayoffCurvePoint {
  price: number;
  pnl: number;
}

const ZERO_TOLERANCE = 1e-8;
const PRICE_TOLERANCE = 1e-9;

const isZeroPnl = (value: number) => Math.abs(value) <= ZERO_TOLERANCE;

const pushUniquePrice = (prices: number[], price: number) => {
  if (!Number.isFinite(price)) return;
  const last = prices[prices.length - 1];
  if (last != null && Math.abs(last - price) <= PRICE_TOLERANCE) return;
  prices.push(price);
};

export const getBreakevens = (points: PayoffCurvePoint[]) => {
  if (points.length === 0) return [];

  const result: number[] = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index <= lastIndex; index += 1) {
    const point = points[index];

    if (!isZeroPnl(point.pnl)) {
      if (index === 0) continue;

      const previous = points[index - 1];
      if (isZeroPnl(previous.pnl)) continue;

      if ((previous.pnl < 0 && point.pnl > 0) || (previous.pnl > 0 && point.pnl < 0)) {
        const denominator = Math.abs(previous.pnl) + Math.abs(point.pnl);
        const ratio = denominator > 0 ? Math.abs(previous.pnl) / denominator : 0;
        pushUniquePrice(result, previous.price + (point.price - previous.price) * ratio);
      }
      continue;
    }

    const start = index;
    while (index < lastIndex && isZeroPnl(points[index + 1].pnl)) {
      index += 1;
    }
    const end = index;

    if (start === 0 && end === lastIndex) {
      pushUniquePrice(result, points[start].price);
      continue;
    }

    if (start === 0) {
      pushUniquePrice(result, points[end].price);
      continue;
    }

    if (end === lastIndex) {
      pushUniquePrice(result, points[start].price);
      continue;
    }

    pushUniquePrice(result, points[start].price);
    if (end !== start) {
      pushUniquePrice(result, points[end].price);
    }
  }

  return result;
};
