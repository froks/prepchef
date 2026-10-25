import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { parseIngredient } from '../../../server/src/domain/ingredients.ts';
import { api, type Diet, type Ingredient, type MealType, type RecipeInput, type Step } from '../api.ts';
import { CATEGORY_LABEL, DIET_LABEL, formatAmount, MEAL_LABEL } from '../labels.ts';

const EMPTY: RecipeInput = {
  title: '',
  description: '',
  servings: 4,
  mealTypes: ['mittag', 'abend'],
  diet: 'alles',
  tags: [],
  ingredients: [],
  steps: [{ text: '', minutes: 10, passive: false }],
  nutrition: null,
  fridgeDays: 3,
  freezable: false,
  favorite: false,
  sourceUrl: null,
  imageUrl: null,
};

function ingredientLine(i: Ingredient): string {
  return [formatAmount(i.amount, i.unit), i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');
}

export function RecipeEditorPage() {
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const draft = (useLocation().state as { draft?: RecipeInput } | null)?.draft;
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<RecipeInput>(draft ?? EMPTY);
  const [ingredientText, setIngredientText] = useState((draft?.ingredients ?? []).map(ingredientLine).join('\n'));
  const [tagText, setTagText] = useState((draft?.tags ?? []).join(', '));
  const [loading, setLoading] = useState(editId != null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editId == null) return;
    api
      .recipe(editId)
      .then((r) => {
        setRecipe(r);
        setIngredientText(r.ingredients.map(ingredientLine).join('\n'));
        setTagText(r.tags.join(', '));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editId]);

  const ingredients = useMemo(
    () =>
      ingredientText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseIngredient),
    [ingredientText],
  );

  const set = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setRecipe((r) => ({ ...r, [key]: value }));
  const setStep = (idx: number, patch: Partial<Step>) =>
    set(
      'steps',
      recipe.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  const moveStep = (idx: number, dir: -1 | 1) => {
    const steps = [...recipe.steps];
    const [s] = steps.splice(idx, 1);
    steps.splice(idx + dir, 0, s);
    set('steps', steps);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: RecipeInput = {
      ...recipe,
      ingredients,
      tags: tagText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      steps: recipe.steps.filter((s) => s.text.trim()),
    };
    try {
      const saved = editId != null ? await api.updateRecipe(editId, payload) : await api.createRecipe(payload);
      navigate(`/rezepte/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Lade Rezept …</p>;

  const n = recipe.nutrition;
  return (
    <form className="editor" onSubmit={submit}>
      <header className="page-head">
        <h1>{editId != null ? 'Rezept bearbeiten' : draft ? 'Importiertes Rezept prüfen' : 'Neues Rezept'}</h1>
      </header>
      {draft && (
        <p className="notice">
          Import von <strong>{draft.sourceUrl && new URL(draft.sourceUrl).hostname}</strong>. Bitte prüfe vor allem{' '}
          <strong>Haltbarkeit</strong>, <strong>Mahlzeiten</strong> und die geschätzten <strong>Schrittdauern</strong> – die stehen selten
          auf Rezeptseiten.
        </p>
      )}

      <section className="card form">
        <div className="field">
          <label htmlFor="title">Titel</label>
          <input id="title" required value={recipe.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="desc">Beschreibung</label>
          <textarea id="desc" rows={2} value={recipe.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="servings">Portionen</label>
            <input
              id="servings"
              type="number"
              min={1}
              max={50}
              value={recipe.servings}
              onChange={(e) => set('servings', Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="field">
            <label htmlFor="diet">Ernährung</label>
            <select id="diet" value={recipe.diet} onChange={(e) => set('diet', e.target.value as Diet)}>
              {(Object.keys(DIET_LABEL) as Diet[]).map((d) => (
                <option key={d} value={d}>
                  {DIET_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="field">
          <legend>Passt zu</legend>
          <div className="chips">
            {(Object.keys(MEAL_LABEL) as MealType[]).map((m) => {
              const on = recipe.mealTypes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  className={`chip ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => set('mealTypes', on ? recipe.mealTypes.filter((x) => x !== m) : [...recipe.mealTypes, m])}
                >
                  {MEAL_LABEL[m]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="row">
          <div className="field">
            <label htmlFor="fridge">Hält im Kühlschrank (Tage)</label>
            <input
              id="fridge"
              type="number"
              min={0}
              max={30}
              value={recipe.fridgeDays}
              onChange={(e) => set('fridgeDays', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <span className="label">Einfrieren</span>
            <label className="inline">
              <input type="checkbox" checked={recipe.freezable} onChange={(e) => set('freezable', e.target.checked)} /> lässt sich
              einfrieren
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" placeholder="z. B. curry, reis, schnell" value={tagText} onChange={(e) => setTagText(e.target.value)} />
          <small>Kommagetrennt. Der Planer vermeidet zwei Gerichte mit gleichen Tags am selben Kochtag.</small>
        </div>
      </section>

      <section className="card form">
        <h2>Zutaten</h2>
        <div className="ingredient-editor">
          <div className="field">
            <label htmlFor="ingredients">Eine Zutat pro Zeile</label>
            <textarea
              id="ingredients"
              rows={Math.max(8, ingredients.length + 2)}
              placeholder={'500 g Rinderhackfleisch\n2 Zwiebeln\n1 Dose gehackte Tomaten (400 g)\nSalz'}
              value={ingredientText}
              onChange={(e) => setIngredientText(e.target.value)}
            />
          </div>
          <div className="parsed" aria-live="polite">
            <span className="label">So verstehe ich das</span>
            <ul>
              {ingredients.map((i, idx) => (
                <li key={idx}>
                  <span className="amount">{formatAmount(i.amount, i.unit) || '–'}</span>
                  <span>{i.name}</span>
                  <span className="tag subtle">{CATEGORY_LABEL[i.category]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card form">
        <h2>Zubereitung</h2>
        <p className="muted small">
          Markiere Schritte als <em>nebenbei</em>, wenn sie ohne dich laufen (Ofen, Köcheln, Quellen). So kann der Prep-Ablauf mehrere
          Gerichte parallel planen.
        </p>
        <ol className="step-editor">
          {recipe.steps.map((s, idx) => (
            <li key={idx}>
              <textarea rows={2} value={s.text} placeholder="Was ist zu tun?" onChange={(e) => setStep(idx, { text: e.target.value })} />
              <div className="step-meta">
                <label className="inline">
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={s.minutes}
                    onChange={(e) => setStep(idx, { minutes: Number(e.target.value) })}
                  />{' '}
                  Min.
                </label>
                <label className="inline">
                  <input type="checkbox" checked={s.passive} onChange={(e) => setStep(idx, { passive: e.target.checked })} /> nebenbei
                </label>
                <span className="step-buttons">
                  <button type="button" className="icon" disabled={idx === 0} onClick={() => moveStep(idx, -1)} aria-label="Nach oben">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon"
                    disabled={idx === recipe.steps.length - 1}
                    onClick={() => moveStep(idx, 1)}
                    aria-label="Nach unten"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon"
                    onClick={() => set('steps', recipe.steps.filter((_, i) => i !== idx))}
                    aria-label="Schritt entfernen"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => set('steps', [...recipe.steps, { text: '', minutes: 5, passive: false }])}>
          + Schritt
        </button>
      </section>

      <section className="card form">
        <h2>Nährwerte pro Portion</h2>
        <label className="inline">
          <input
            type="checkbox"
            checked={n != null}
            onChange={(e) => set('nutrition', e.target.checked ? { kcal: 500, protein: 25, carbs: 50, fat: 20 } : null)}
          />{' '}
          Nährwerte angeben
        </label>
        {n && (
          <div className="row four">
            {(
              [
                ['kcal', 'Kalorien (kcal)'],
                ['protein', 'Eiweiß (g)'],
                ['carbs', 'Kohlenhydrate (g)'],
                ['fat', 'Fett (g)'],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label htmlFor={`n-${key}`}>{label}</label>
                <input
                  id={`n-${key}`}
                  type="number"
                  min={0}
                  value={n[key]}
                  onChange={(e) => set('nutrition', { ...n, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      <div className="actions sticky">
        <button type="button" onClick={() => navigate(-1)}>
          Abbrechen
        </button>
        <button className="primary" type="submit" disabled={saving || !recipe.mealTypes.length}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}
