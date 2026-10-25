import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { activeMinutes, isLowCarb, isLowEffort, isQuick, matchesPreference, totalMinutes } from '../../../server/src/domain/traits.ts';
import { api, type Diet, type MealType, type Preference, type Recipe } from '../api.ts';
import { DIET_LABEL, formatMinutes, MEAL_LABEL, PREFERENCE_HINT, PREFERENCE_ICON, PREFERENCE_LABEL } from '../labels.ts';
import { useAsync } from '../useAsync.ts';

export function RecipesPage() {
  const navigate = useNavigate();
  const { data: recipes, setData, error, loading } = useAsync(api.recipes, []);
  const [query, setQuery] = useState('');
  const [diet, setDiet] = useState<Diet | ''>('');
  const [meal, setMeal] = useState<MealType | ''>('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes ?? []).filter(
      (r) =>
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.tags.some((t) => t.includes(q)) ||
          r.ingredients.some((i) => i.name.toLowerCase().includes(q))) &&
        (!diet || r.diet === diet) &&
        (!meal || r.mealTypes.includes(meal)) &&
        (!onlyFav || r.favorite) &&
        prefs.every((p) => matchesPreference(r, p)),
    );
  }, [recipes, query, diet, meal, onlyFav, prefs]);

  async function importRecipe(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setImportError(null);
    try {
      const draft = await api.importRecipe(importUrl.trim());
      navigate('/rezepte/neu', { state: { draft } });
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function toggleFavorite(r: Recipe) {
    const updated = await api.setFavorite(r.id, !r.favorite);
    setData((list) => list?.map((x) => (x.id === r.id ? updated : x)) ?? null);
  }

  return (
    <div className="recipes">
      <header className="page-head">
        <h1>Rezepte</h1>
        <Link to="/rezepte/neu" className="button primary">
          + Neues Rezept
        </Link>
      </header>

      <form className="card import" onSubmit={importRecipe}>
        <label htmlFor="import-url">Rezept aus dem Web importieren</label>
        <div className="import-row">
          <input
            id="import-url"
            type="url"
            required
            placeholder="https://www.chefkoch.de/rezepte/…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
          />
          <button type="submit" disabled={importing}>
            {importing ? 'Lade …' : 'Importieren'}
          </button>
        </div>
        <small className="muted">
          Funktioniert mit allen Seiten, die strukturierte Rezeptdaten anbieten (Chefkoch, Lecker, EatSmarter, BBC Good Food u. v. m.). Du
          kannst das Rezept vor dem Speichern prüfen.
        </small>
        {importError && <p className="error">{importError}</p>}
      </form>

      <div className="filters">
        <input type="search" placeholder="Suchen nach Titel, Zutat, Tag …" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={meal} onChange={(e) => setMeal(e.target.value as MealType | '')} aria-label="Mahlzeit">
          <option value="">Alle Mahlzeiten</option>
          {(Object.keys(MEAL_LABEL) as MealType[]).map((m) => (
            <option key={m} value={m}>
              {MEAL_LABEL[m]}
            </option>
          ))}
        </select>
        <select value={diet} onChange={(e) => setDiet(e.target.value as Diet | '')} aria-label="Ernährung">
          <option value="">Alle Ernährungsformen</option>
          {(Object.keys(DIET_LABEL) as Diet[]).map((d) => (
            <option key={d} value={d}>
              {DIET_LABEL[d]}
            </option>
          ))}
        </select>
        {(Object.keys(PREFERENCE_LABEL) as Preference[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${prefs.includes(p) ? 'on' : ''}`}
            aria-pressed={prefs.includes(p)}
            title={PREFERENCE_HINT[p]}
            onClick={() => setPrefs(prefs.includes(p) ? prefs.filter((x) => x !== p) : [...prefs, p])}
          >
            {PREFERENCE_ICON[p]} {PREFERENCE_LABEL[p]}
          </button>
        ))}
        <label className="inline">
          <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Nur Favoriten
        </label>
        {recipes && <span className="muted small">{filtered.length} Rezepte</span>}
      </div>

      {loading && <p className="muted">Lade Rezepte …</p>}
      {error && <p className="error">{error}</p>}

      <div className="recipe-grid">
        {filtered.map((r) => (
          <article key={r.id} className="card recipe-card">
            {r.imageUrl && <img src={r.imageUrl} alt="" loading="lazy" />}
            <div className="recipe-card-body">
              <div className="recipe-card-top">
                <Link to={`/rezepte/${r.id}`} className="recipe-card-title">
                  {r.title}
                </Link>
                <button
                  className={`fav ${r.favorite ? 'on' : ''}`}
                  aria-label={r.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                  aria-pressed={r.favorite}
                  onClick={() => toggleFavorite(r)}
                >
                  {r.favorite ? '★' : '☆'}
                </button>
              </div>
              <p className="muted small">{r.mealTypes.map((m) => MEAL_LABEL[m]).join(' · ')}</p>
              <div className="tags">
                <span className={`tag diet-${r.diet}`}>{DIET_LABEL[r.diet]}</span>
                {r.nutrition && <span className="tag">{r.nutrition.kcal} kcal</span>}
                <span className={`tag ${isLowEffort(r) ? 'quick' : ''}`} title="Aktive Koch- und Vorbereitungszeit">
                  🔪 {formatMinutes(activeMinutes(r))} aktiv
                </span>
                <span className={`tag ${isQuick(r) ? 'quick' : ''}`} title="Gesamtzeit inkl. Garen, Backen und Auftauen">
                  {isQuick(r) ? '⚡' : '⏱'} {formatMinutes(totalMinutes(r))} gesamt
                </span>
                {isLowCarb(r) && (
                  <span className="tag lowcarb" title={PREFERENCE_HINT.lowcarb}>
                    Low Carb
                  </span>
                )}
                <span className="tag">{r.freezable ? `${r.fridgeDays} Tage · ❄️` : `${r.fridgeDays} Tage`}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !filtered.length && <p className="muted">Keine Rezepte gefunden.</p>}
    </div>
  );
}
