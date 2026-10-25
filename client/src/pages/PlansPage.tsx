import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { DIET_LABEL, formatDate, MEAL_LABEL } from '../labels.ts';
import { useAsync } from '../useAsync.ts';

export function PlansPage() {
  const { data: plans, error, loading } = useAsync(api.plans, []);

  return (
    <div>
      <header className="page-head">
        <h1>Pläne</h1>
        <Link to="/" className="button primary">
          + Neuer Plan
        </Link>
      </header>
      {loading && <p className="muted">Lade …</p>}
      {error && <p className="error">{error}</p>}
      {plans && !plans.length && (
        <p className="muted">
          Noch keine Pläne. <Link to="/">Jetzt den ersten erstellen</Link>.
        </p>
      )}
      <ul className="plan-list">
        {plans?.map((p) => (
          <li key={p.id} className="card">
            <Link to={`/plaene/${p.id}`}>
              <strong>Woche ab {formatDate(p.settings.weekStart)}</strong>
              <span className="muted small">
                {p.recipeCount} Gerichte · {p.mealCount} Mahlzeiten · {p.settings.slots.map((s) => MEAL_LABEL[s]).join(', ')} ·{' '}
                {DIET_LABEL[p.settings.diet]} · {p.settings.persons} P.
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
