import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type ExpandedPlan, type MealType } from '../api.ts';
import { ConfirmButton } from '../components/ConfirmButton.tsx';
import { NutritionView } from '../components/NutritionView.tsx';
import { PrepTimeline } from '../components/PrepTimeline.tsx';
import { ShoppingList } from '../components/ShoppingList.tsx';
import { WeekGrid } from '../components/WeekGrid.tsx';
import { DIET_LABEL, formatDate, MEAL_LABEL, PREFERENCE_LABEL } from '../labels.ts';
import { useAsync } from '../useAsync.ts';

const TABS = [
  ['woche', 'Woche'],
  ['einkauf', 'Einkaufsliste'],
  ['ablauf', 'Prep-Ablauf'],
  ['naehrwerte', 'Nährwerte'],
] as const;
type Tab = (typeof TABS)[number][0];

export function PlanPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: plan, setData: setPlan, error, loading } = useAsync(() => api.plan(id), [id]);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([key]) => key === params.get('tab'))?.[0] ?? 'woche') as Tab;
  const setTab = (t: Tab) => setParams(t === 'woche' ? {} : { tab: t }, { replace: true });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !plan) return <p className="muted">Lade Plan …</p>;
  if (error || !plan) return <p className="error">{error ?? 'Plan nicht gefunden'}</p>;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const regenerate = () =>
    run(async () => {
      const next = await api.createPlan(plan.settings);
      navigate(`/plaene/${next.id}`);
    });

  const remove = () =>
    run(async () => {
      await api.deletePlan(plan.id);
      navigate('/plaene');
    });

  const swap = (session: number, slot: MealType, recipeId: number) =>
    run(async () => setPlan(await api.swap(plan.id, session, slot, recipeId)));

  const s = plan.settings;
  return (
    <div className="plan">
      <header className="plan-head">
        <div>
          <h1>Woche ab {formatDate(s.weekStart)}</h1>
          <p className="muted">
            {s.persons} {s.persons === 1 ? 'Person' : 'Personen'} · {s.slots.map((m) => MEAL_LABEL[m]).join(', ')} ·{' '}
            {DIET_LABEL[s.diet]}
            {s.kcalTarget ? ` · Ziel ${s.kcalTarget} kcal` : ''}
            {s.preferences.map((p) => ` · ${PREFERENCE_LABEL[p]}`).join('')}
          </p>
        </div>
        <div className="head-actions no-print">
          <button onClick={regenerate} disabled={busy}>
            Neu würfeln
          </button>
          <button onClick={() => window.print()}>Drucken</button>
          <ConfirmButton className="danger" onConfirm={remove} disabled={busy} confirmLabel="Wirklich löschen?">
            Löschen
          </ConfirmButton>
        </div>
      </header>

      {actionError && <p className="error">{actionError}</p>}

      {plan.data.warnings.length > 0 && (
        <ul className="warnings">
          {plan.data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="tabs no-print" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <PlanTab tab={tab} plan={plan} busy={busy} onSwap={swap} onChecked={(checked) => setPlan({ ...plan, checked })} />

      <p className="muted small no-print">
        <Link to="/">Anderen Plan erstellen</Link>
      </p>
    </div>
  );
}

function PlanTab(props: {
  tab: Tab;
  plan: ExpandedPlan;
  busy: boolean;
  onSwap: (session: number, slot: MealType, recipeId: number) => void;
  onChecked: (checked: string[]) => void;
}) {
  const { plan } = props;
  switch (props.tab) {
    case 'woche':
      return <WeekGrid plan={plan} busy={props.busy} onSwap={props.onSwap} />;
    case 'einkauf':
      return <ShoppingList plan={plan} onChecked={props.onChecked} />;
    case 'ablauf':
      return <PrepTimeline plan={plan} />;
    case 'naehrwerte':
      return <NutritionView plan={plan} />;
  }
}
