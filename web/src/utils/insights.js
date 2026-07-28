import { formatINR } from '../format';

export function buildInsights(data, derived) {
  const insights = [];
  const { spendByCategory, spentThisMonth, savingsRate, sipPaidThisMonth } = derived;
  const budget = data.profile.monthlyBudget || 1;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pctOfMonthElapsed = now.getDate() / daysInMonth;
  const pctBudgetUsed = spentThisMonth / budget;

  if (pctBudgetUsed > pctOfMonthElapsed + 0.15 && pctBudgetUsed < 1) {
    insights.push({
      id: 'pace',
      tone: 'warn',
      text: `You've used ${Math.round(pctBudgetUsed * 100)}% of this month's budget with ${Math.round((1 - pctOfMonthElapsed) * 100)}% of the month left. At this pace you'll run out early.`,
    });
  } else if (pctBudgetUsed >= 1) {
    insights.push({
      id: 'over',
      tone: 'alert',
      text: `You're ${formatINR(spentThisMonth - budget)} over budget this month.`,
    });
  }

  const catEntries = Object.entries(spendByCategory).sort((a, b) => b[1] - a[1]);
  if (catEntries.length > 0) {
    const [topCat, topAmt] = catEntries[0];
    insights.push({
      id: 'top-cat',
      tone: 'neutral',
      text: `${topCat} is your biggest spend this month at ${formatINR(topAmt)}.`,
    });
  }

  if (savingsRate < 20) {
    insights.push({
      id: 'savings-low',
      tone: 'warn',
      text: `Your savings rate is ${savingsRate}% this month — below the 20% mark most wealth plans target.`,
    });
  } else {
    insights.push({
      id: 'savings-good',
      tone: 'good',
      text: `Savings rate is ${savingsRate}% this month — solid work.`,
    });
  }

  if (!sipPaidThisMonth) {
    insights.push({
      id: 'sip-due',
      tone: 'warn',
      text: `This month's SIP of ${formatINR(data.investments.sipMonthly)} hasn't been logged yet.`,
    });
  }

  if (data.goals.length > 0) {
    const behind = [...data.goals]
      .map((g) => ({ ...g, pct: g.target ? g.current / g.target : 0 }))
      .sort((a, b) => a.pct - b.pct)[0];
    if (behind && behind.pct < 0.5) {
      insights.push({
        id: 'goal-behind',
        tone: 'neutral',
        text: `${behind.name} is at ${Math.round(behind.pct * 100)}% — your furthest goal from target right now.`,
      });
    }
  }

  return insights;
}
