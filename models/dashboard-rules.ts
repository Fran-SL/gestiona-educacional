import { calculateAchievement, basisPointsSchema } from "./milestone-rules";

export type DashboardDimension = {
  id: string; name: string; weightBps: number;
  actions: {
    id: string; name: string; responsibleName: string; weightBps: number;
    actualExpense: string | null; currency: string;
    milestones: { name: string; weightBps: number; progressBps: number }[];
  }[];
};
function weighted(items: { weightBps: number; achievement: number | null }[]): number | null {
  if (!items.length || items.some(i => !basisPointsSchema.safeParse(i.weightBps).success || i.achievement === null)
    || items.reduce((sum, i) => sum + i.weightBps, 0) !== 10000) return null;
  return items.reduce((sum, i) => sum + i.weightBps * i.achievement!, 0) / 10000;
}

/** Percentages (0–100), without rounding intermediate contributions. */
export function calculateDashboard(input: DashboardDimension[]) {
  const dimensions = input.map(d => ({
    id: d.id, name: d.name, weightBps: d.weightBps,
    actions: d.actions.map(a => {
      let achievement: number | null = null;
      try { achievement = calculateAchievement(a.milestones); } catch { /* Incomplete structure must not look like 0% achievement. */ }
      return { id: a.id, name: a.name, responsibleName: a.responsibleName, weightBps: a.weightBps, achievement };
    }),
  })).map(d => ({ ...d, achievement: weighted(d.actions) }));
  const actions = dimensions.flatMap(d => d.actions);
  const milestones = input.flatMap(d => d.actions.flatMap(a => a.milestones));
  const expenses = new Map<string, bigint>();
  let recordedExpenses = 0;
  for (const a of input.flatMap(d => d.actions)) {
    if (a.actualExpense === null) continue;
    // PostgreSQL Decimal(18,2): add in cents, without conversion to floating point.
    if (!/^\d+(?:\.\d{1,2})?$/.test(a.actualExpense)) throw new Error("Gasto real inválido.");
    const [whole, fraction = ""] = a.actualExpense.split(".");
    const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    expenses.set(a.currency, (expenses.get(a.currency) ?? BigInt(0)) + cents);
    recordedExpenses++;
  }
  return {
    achievement: weighted(dimensions), dimensions,
    actions: { total: actions.length, notStarted: actions.filter(a => a.achievement === 0).length,
      inProgress: actions.filter(a => a.achievement !== null && a.achievement > 0 && a.achievement < 100).length,
      completed: actions.filter(a => a.achievement === 100).length,
      unavailable: actions.filter(a => a.achievement === null).length },
    milestones: { total: milestones.length, notStarted: milestones.filter(h => h.progressBps === 0).length,
      inProgress: milestones.filter(h => h.progressBps > 0 && h.progressBps < 10000).length,
      completed: milestones.filter(h => h.progressBps === 10000).length },
    expenses: [...expenses].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}` })),
    recordedExpenses, missingExpenses: actions.length - recordedExpenses,
  };
}

export type DashboardReviewPoint = {
  id: string; title: string; createdAt: string; status: "ABIERTA" | "FINALIZADA";
  achievement: number | null;
};
/** Preserve missing values as gaps and compare only adjacent reviews. */
export function prepareDashboardHistory(reviews: DashboardReviewPoint[]) {
  const points = [...reviews].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const previous = points.at(-2), latest = points.at(-1);
  const change = previous && latest && previous.achievement !== null && latest.achievement !== null
    ? latest.achievement - previous.achievement : null;
  return { points, change };
}
