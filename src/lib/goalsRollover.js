// Zamknięcie roku celów i przenoszenie (rollover) na nowy rok kalendarzowy.
import { computeLimitsForYear } from './tax.js';
import { goalProgress, goalsSummary } from './goals.js';
import { uid } from './format.js';

// Rok wymagający podsumowania: poprzedni rok kalendarzowy z celami, którego jeszcze nie zamknięto
export function yearNeedingReview(state, now = new Date()) {
  const prev = now.getFullYear() - 1;
  const reviewed = state.settings.goalsReview?.reviewedYears || [];
  if (reviewed.includes(prev)) return null;
  const hasOpen = state.goals.some((g) => Number(g.year) === prev && g.status !== 'ARCHIVED');
  return hasOpen ? prev : null;
}

// Nowa wartość docelowa celu automatycznego powiązanego z limitem wpłat
function limitTarget(settings, source, year) {
  const l = computeLimitsForYear(settings, year);
  if (source === 'IKE_LIMIT') return l.ike;
  if (source === 'IKZE_LIMIT') return settings.selfEmployed ? l.ikzeSelfEmployed : l.ikze;
  return null;
}

function renameForYear(name, fromYear, toYear) {
  return String(name).replaceAll(String(fromYear), String(toYear));
}

// Plan przeniesienia: wynik każdego celu + domyślna decyzja i proponowany cel na nowy rok
export function buildRolloverPlan(state, fromYear) {
  const toYear = fromYear + 1;
  const summary = goalsSummary(state, fromYear);
  const items = summary.rows
    .filter((r) => r.goal.status !== 'ARCHIVED')
    .map((r) => {
      const auto = r.goal.source && r.goal.source !== 'MANUAL';
      const limit = limitTarget(state.settings, r.goal.source, toYear);
      const alreadyRolled = state.goals.some((g) => g.rolledFrom === r.goal.id);
      return {
        goal: r.goal,
        current: r.current,
        target: r.target,
        pct: r.pct,
        success: r.done,
        auto,
        action: alreadyRolled ? 'ARCHIVE' : 'ROLL',
        alreadyRolled,
        newTarget: limit ?? r.target,
        newTargetSource: limit !== null ? `limit ${r.goal.source === 'IKE_LIMIT' ? 'IKE' : 'IKZE'} ${toYear}` : null,
      };
    });
  return { fromYear, toYear, summary, items };
}

// Zastosowanie decyzji: zamrożenie wyników wszystkich celów roku + kopie przenoszonych celów
export function applyRollover(state, plan, decisions) {
  const closedAt = new Date().toISOString();
  const updates = [];
  const creates = [];
  for (const item of plan.items) {
    const d = decisions[item.goal.id] || { action: item.action, target: item.newTarget };
    const progress = goalProgress(state, item.goal);
    const update = {
      id: item.goal.id,
      status: 'ARCHIVED',
      closedAt,
      result: { current: progress.current, pct: progress.pct, done: progress.done },
      rolloverDecision: d.action,
    };
    if (d.action === 'ROLL' && !item.alreadyRolled) {
      const id = uid('goa');
      const { status, result, closedAt: _c, rolloverDecision, rolledTo, ...base } = item.goal;
      creates.push({
        ...base,
        id,
        year: plan.toYear,
        name: renameForYear(item.goal.name, plan.fromYear, plan.toYear),
        target: Number(d.target) || item.newTarget || item.target,
        // Cel „w dół” kontynuowany od osiągniętej wartości; „w górę” – licznik od zera
        current: progress.direction === 'DOWN' ? progress.current : 0,
        startValue: progress.direction === 'DOWN' ? progress.current : undefined,
        rolledFrom: item.goal.id,
      });
      update.rolledTo = id;
    }
    updates.push(update);
  }
  return { updates, creates, year: plan.fromYear };
}

// Cofnięcie archiwizacji roku (cele wracają do edycji; utworzone kopie pozostają)
export function reopenYear(state, year) {
  const updates = state.goals
    .filter((g) => Number(g.year) === year && g.status === 'ARCHIVED')
    .map((g) => ({ id: g.id, status: 'ACTIVE', result: null, closedAt: null }));
  return updates;
}
