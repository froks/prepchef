import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Diet, type MealType, type PlanSettings } from '../api.ts';
import { DAY_SHORT, DIET_LABEL, formatDate, MEAL_LABEL, nextMonday } from '../labels.ts';

const DEFAULTS: PlanSettings = {
  weekStart: nextMonday(),
  days: [0, 1, 2, 3, 4],
  slots: ['mittag'],
  persons: 1,
  kcalTarget: 2000,
  diet: 'alles',
  prepSessions: 1,
  recipesPerSlot: 2,
  excludeIngredients: [],
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function PlannerPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PlanSettings>(DEFAULTS);
  const [exclude, setExclude] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Einstellungen des letzten Plans übernehmen – die meisten planen jede Woche gleich.
  useEffect(() => {
    api
      .plans()
      .then((plans) => {
        if (!plans.length) return;
        const last = plans[0].settings;
        setSettings({ ...last, weekStart: nextMonday() });
        setExclude(last.excludeIngredients.join(', '));
      })
      .catch(() => {});
  }, []);

  const set = <K extends keyof PlanSettings>(key: K, value: PlanSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const plan = await api.createPlan({
        ...settings,
        days: [...settings.days].sort((a, b) => a - b),
        excludeIngredients: exclude
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      navigate(`/plaene/${plan.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const mealsPerWeek = settings.days.length * settings.slots.length;
  const valid = settings.days.length > 0 && settings.slots.length > 0;

  return (
    <div className="planner">
      <section className="hero">
        <h1>Deine Meal-Prep-Woche</h1>
        <p>
          Sag mir, wie du isst – ich wähle Gerichte, die gut zusammenpassen, schreibe die Einkaufsliste und plane deinen Kochtag so,
          dass Ofen und Herd parallel arbeiten.
        </p>
      </section>

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="weekStart">Woche ab</label>
          <input
            id="weekStart"
            type="date"
            value={settings.weekStart}
            onChange={(e) => set('weekStart', e.target.value)}
            required
          />
          <small>{settings.weekStart && formatDate(settings.weekStart)}</small>
        </div>

        <fieldset className="field">
          <legend>Für welche Tage?</legend>
          <div className="chips">
            {DAY_SHORT.map((d, i) => (
              <button
                type="button"
                key={d}
                className={`chip ${settings.days.includes(i) ? 'on' : ''}`}
                aria-pressed={settings.days.includes(i)}
                onClick={() => set('days', toggle(settings.days, i))}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Welche Mahlzeiten?</legend>
          <div className="chips">
            {(Object.keys(MEAL_LABEL) as MealType[]).map((m) => (
              <button
                type="button"
                key={m}
                className={`chip ${settings.slots.includes(m) ? 'on' : ''}`}
                aria-pressed={settings.slots.includes(m)}
                onClick={() => set('slots', toggle(settings.slots, m))}
              >
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="row">
          <div className="field">
            <label htmlFor="persons">Personen</label>
            <input
              id="persons"
              type="number"
              min={1}
              max={20}
              value={settings.persons}
              onChange={(e) => set('persons', Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="field">
            <label htmlFor="kcal">Kalorienziel pro Person/Tag</label>
            <input
              id="kcal"
              type="number"
              min={800}
              max={6000}
              step={50}
              placeholder="egal"
              value={settings.kcalTarget ?? ''}
              onChange={(e) => set('kcalTarget', e.target.value ? Number(e.target.value) : null)}
            />
            <small>Für den ganzen Tag – jede Mahlzeit bekommt ihren Anteil.</small>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="diet">Ernährung</label>
            <select id="diet" value={settings.diet} onChange={(e) => set('diet', e.target.value as Diet)}>
              {(Object.keys(DIET_LABEL) as Diet[]).map((d) => (
                <option key={d} value={d}>
                  {DIET_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="variety">Gerichte pro Mahlzeit</label>
            <select id="variety" value={settings.recipesPerSlot} onChange={(e) => set('recipesPerSlot', Number(e.target.value))}>
              <option value={1}>1 – maximal effizient</option>
              <option value={2}>2 – etwas Abwechslung</option>
              <option value={3}>3 – viel Abwechslung</option>
            </select>
            <small>pro Kochtag – jedes Gericht reicht für mindestens 2 Tage</small>
          </div>
        </div>

        <fieldset className="field">
          <legend>Kochtage</legend>
          <div className="segmented">
            <label>
              <input type="radio" name="sessions" checked={settings.prepSessions === 1} onChange={() => set('prepSessions', 1)} />
              Einmal pro Woche
            </label>
            <label>
              <input type="radio" name="sessions" checked={settings.prepSessions === 2} onChange={() => set('prepSessions', 2)} />
              Zweimal (+ Wochenmitte)
            </label>
          </div>
          <small>Zwei Kochtage halten alles frischer, gerade bei Fisch und Geflügel.</small>
        </fieldset>

        <div className="field">
          <label htmlFor="exclude">Zutaten ausschließen</label>
          <input
            id="exclude"
            type="text"
            placeholder="z. B. Pilze, Koriander, Lachs"
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
          />
          <small>Kommagetrennt</small>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <span className="muted">{mealsPerWeek} Mahlzeiten pro Person</span>
          <button className="primary" type="submit" disabled={busy || !valid}>
            {busy ? 'Plane …' : 'Plan erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}
