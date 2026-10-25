import { Link } from 'react-router-dom';
import { activeMinutes } from '../../../server/src/domain/traits.ts';
import type { ExpandedPlan, MealType } from '../api.ts';
import { DAY_LONG, formatDate, formatMinutes, formatShortDate, MEAL_LABEL } from '../labels.ts';

export function WeekGrid({
  plan,
  busy,
  onSwap,
}: {
  plan: ExpandedPlan;
  busy: boolean;
  onSwap: (session: number, slot: MealType, recipeId: number) => void;
}) {
  const { meals, sessions } = plan.data;
  const slots = plan.settings.slots;

  return (
    <div className="week">
      {sessions.map((session) => (
        <section key={session.index} className="session">
          <h2 className="session-title">
            <span className="badge">Kochtag</span> {formatDate(session.prepDate)}
          </h2>
          <div className="days">
            {session.days.map((day) => {
              const dayMeals = meals.filter((m) => m.day === day);
              return (
                <article key={day} className="day card">
                  <h3>
                    {DAY_LONG[day]} <span className="muted">{formatShortDate(dayMeals[0]?.date ?? '')}</span>
                  </h3>
                  {slots.map((slot) => {
                    const meal = dayMeals.find((m) => m.slot === slot);
                    const recipe = meal?.recipeId != null ? plan.recipes[meal.recipeId] : undefined;
                    return (
                      <div key={slot} className="meal">
                        <span className="meal-slot">{MEAL_LABEL[slot]}</span>
                        {recipe ? (
                          <>
                            <Link to={`/rezepte/${recipe.id}`} className="meal-title">
                              {recipe.title}
                            </Link>
                            <span className="meal-meta">
                              {recipe.nutrition ? `${recipe.nutrition.kcal} kcal` : '– kcal'} · {formatMinutes(activeMinutes(recipe))} aktiv
                              {recipe.freezable && day - (session.days[0] - 1) > recipe.fridgeDays && (
                                <span title="Am Kochtag einfrieren, am Vorabend auftauen"> · ❄️ einfrieren</span>
                              )}
                            </span>
                            <button
                              className="link no-print"
                              disabled={busy}
                              title="Dieses Gericht überall in diesem Kochtag ersetzen"
                              onClick={() => onSwap(session.index, slot, recipe.id)}
                            >
                              Austauschen
                            </button>
                          </>
                        ) : (
                          <span className="muted">{meal?.recipeId != null ? 'Rezept gelöscht' : 'nichts geplant'}</span>
                        )}
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
