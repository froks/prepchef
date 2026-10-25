import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activeMinutes, isLowCarb, isLowEffort, isQuick, totalMinutes } from '../../../server/src/domain/traits.ts';
import { api } from '../api.ts';
import { DIET_LABEL, formatAmount, formatMinutes, MEAL_LABEL, PREFERENCE_HINT } from '../labels.ts';
import { useAsync } from '../useAsync.ts';

export function RecipeDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: recipe, setData, error, loading } = useAsync(() => api.recipe(id), [id]);
  const [servings, setServings] = useState<number | null>(null);

  if (loading && !recipe) return <p className="muted">Lade Rezept …</p>;
  if (error || !recipe) return <p className="error">{error ?? 'Rezept nicht gefunden'}</p>;

  const portions = servings ?? recipe.servings;
  const factor = portions / recipe.servings;

  async function remove() {
    if (!confirm(`„${recipe!.title}" wirklich löschen?`)) return;
    await api.deleteRecipe(recipe!.id);
    navigate('/rezepte');
  }

  return (
    <article className="recipe-detail">
      <header className="page-head">
        <div>
          <h1>
            {recipe.title}{' '}
            <button
              className={`fav ${recipe.favorite ? 'on' : ''}`}
              aria-label={recipe.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
              onClick={async () => setData(await api.setFavorite(recipe.id, !recipe.favorite))}
            >
              {recipe.favorite ? '★' : '☆'}
            </button>
          </h1>
          {recipe.description && <p className="lead">{recipe.description}</p>}
          <div className="tags">
            <span className={`tag diet-${recipe.diet}`}>{DIET_LABEL[recipe.diet]}</span>
            {recipe.mealTypes.map((m) => (
              <span key={m} className="tag">
                {MEAL_LABEL[m]}
              </span>
            ))}
            <span className={`tag ${isLowEffort(recipe) ? 'quick' : ''}`} title="Aktive Koch- und Vorbereitungszeit">
              🔪 {formatMinutes(activeMinutes(recipe))} aktiv
            </span>
            <span className={`tag ${isQuick(recipe) ? 'quick' : ''}`} title="Gesamtzeit inkl. Garen, Backen und Auftauen">
              {isQuick(recipe) ? '⚡' : '⏱'} {formatMinutes(totalMinutes(recipe))} gesamt
            </span>
            {isLowCarb(recipe) && (
              <span className="tag lowcarb" title={PREFERENCE_HINT.lowcarb}>
                Low Carb
              </span>
            )}
            <span className="tag">🧊 {recipe.fridgeDays} Tage haltbar</span>
            {recipe.freezable && <span className="tag">❄️ einfrierbar</span>}
            {recipe.tags.map((t) => (
              <span key={t} className="tag subtle">
                #{t}
              </span>
            ))}
          </div>
        </div>
        <div className="head-actions">
          <Link className="button" to={`/rezepte/${recipe.id}/bearbeiten`}>
            Bearbeiten
          </Link>
          <button className="danger" onClick={remove}>
            Löschen
          </button>
        </div>
      </header>

      {recipe.imageUrl && <img className="hero-img" src={recipe.imageUrl} alt="" />}

      <div className="recipe-columns">
        <section className="card">
          <h2>Zutaten</h2>
          <label className="inline servings">
            für{' '}
            <input type="number" min={1} max={50} value={portions} onChange={(e) => setServings(Math.max(1, Number(e.target.value)))} />{' '}
            Portionen
          </label>
          <ul className="ingredients">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>
                <span className="amount">{formatAmount(i.amount != null ? Math.round(i.amount * factor * 100) / 100 : null, i.unit)}</span>
                <span>
                  {i.name}
                  {i.note && <span className="muted">, {i.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          {recipe.nutrition && (
            <>
              <h3>Nährwerte pro Portion</h3>
              <dl className="macros">
                <div>
                  <dt>Kalorien</dt>
                  <dd>{recipe.nutrition.kcal} kcal</dd>
                </div>
                <div>
                  <dt>Eiweiß</dt>
                  <dd>{recipe.nutrition.protein} g</dd>
                </div>
                <div>
                  <dt>Kohlenhydrate</dt>
                  <dd>{recipe.nutrition.carbs} g</dd>
                </div>
                <div>
                  <dt>Fett</dt>
                  <dd>{recipe.nutrition.fat} g</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <section className="card">
          <h2>Zubereitung</h2>
          <ol className="method">
            {recipe.steps.map((s, idx) => (
              <li key={idx}>
                <p>{s.text}</p>
                <small className="muted">
                  {formatMinutes(s.minutes)}
                  {s.passive ? ' · nebenbei' : ''}
                </small>
              </li>
            ))}
          </ol>
          {recipe.sourceUrl && (
            <p className="small">
              Quelle:{' '}
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                {new URL(recipe.sourceUrl).hostname}
              </a>
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
