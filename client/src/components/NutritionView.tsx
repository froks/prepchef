import type { ExpandedPlan, Nutrition } from '../api.ts';
import { DAY_LONG, MEAL_LABEL } from '../labels.ts';

export function NutritionView({ plan }: { plan: ExpandedPlan }) {
  const { days, average, target, dailyTarget } = plan.nutrition;
  const max = Math.max(target ?? 0, ...days.map((d) => d.total.kcal), 1);

  return (
    <div className="card nutrition">
      <p className="muted">
        Pro Person, nur vorgekochte Mahlzeiten.
        {target && dailyTarget
          ? target === dailyTarget
            ? ` Ziel: ${target} kcal am Tag.`
            : ` Ziel dafür: ${target} kcal – der Anteil dieser Mahlzeiten an ${dailyTarget} kcal Tagesbedarf.`
          : ''}
      </p>
      <table>
        <thead>
          <tr>
            <th>Tag</th>
            <th className="bar-col">Kalorien</th>
            <th className="num">Eiweiß</th>
            <th className="num">Kohlenhydrate</th>
            <th className="num">Fett</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">
                {DAY_LONG[d.day]}
                <small className="muted block">
                  {d.meals
                    .map((m) => {
                      const r = m.recipeId != null ? plan.recipes[m.recipeId] : undefined;
                      return r ? `${MEAL_LABEL[m.slot]}: ${r.nutrition?.kcal ?? '?'}` : null;
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </th>
              <td className="bar-col">
                <KcalBar kcal={d.total.kcal} max={max} target={target} />
                {d.incomplete && <small className="muted"> unvollständig</small>}
              </td>
              <Macros n={d.total} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Durchschnitt</th>
            <td className="bar-col">
              <KcalBar kcal={average.kcal} max={max} target={target} />
            </td>
            <Macros n={average} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function KcalBar({ kcal, max, target }: { kcal: number; max: number; target: number | null }) {
  const ratio = target ? kcal / target : null;
  const tone = ratio == null ? '' : ratio < 0.85 ? 'low' : ratio > 1.1 ? 'high' : 'ok';
  return (
    <div className="kcal">
      <div className="kcal-track">
        <span className={`kcal-fill ${tone}`} style={{ width: `${(kcal / max) * 100}%` }} />
        {target && <span className="kcal-target" style={{ left: `${(target / max) * 100}%` }} />}
      </div>
      <span className="kcal-value">{kcal} kcal</span>
    </div>
  );
}

function Macros({ n }: { n: Nutrition }) {
  return (
    <>
      <td className="num">{n.protein} g</td>
      <td className="num">{n.carbs} g</td>
      <td className="num">{n.fat} g</td>
    </>
  );
}
