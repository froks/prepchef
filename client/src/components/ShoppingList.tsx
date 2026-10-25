import { useRef, useState } from 'react';
import { api, type ExpandedPlan } from '../api.ts';
import { CATEGORY_LABEL, formatAmount } from '../labels.ts';

export function ShoppingList({ plan, onChecked }: { plan: ExpandedPlan; onChecked: (checked: string[]) => void }) {
  const [copied, setCopied] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const checked = new Set(plan.checked);
  const total = plan.shopping.reduce((s, g) => s + g.items.length, 0);

  function toggle(key: string) {
    const next = checked.has(key) ? plan.checked.filter((k) => k !== key) : [...plan.checked, key];
    onChecked(next);
    // Speichern nacheinander, damit schnelles Klicken nicht in falscher Reihenfolge ankommt.
    saveQueue.current = saveQueue.current.then(() => api.setChecked(plan.id, next).then(() => undefined)).catch(() => {});
  }

  async function copy() {
    const text = plan.shopping
      .map(
        (g) =>
          `${CATEGORY_LABEL[g.category]}\n${g.items
            .filter((i) => !checked.has(i.key))
            .map((i) => `- ${[formatAmount(i.amount, i.unit), i.name].filter(Boolean).join(' ')}`)
            .join('\n')}`,
      )
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="shopping">
      <div className="toolbar no-print">
        <span className="muted">
          {checked.size} von {total} erledigt
        </span>
        <label className="inline">
          <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} /> Erledigte ausblenden
        </label>
        <button onClick={copy}>{copied ? 'Kopiert ✓' : 'Als Text kopieren'}</button>
      </div>
      <div className="shopping-groups">
        {plan.shopping.map((group) => {
          const items = group.items.filter((i) => !hideChecked || !checked.has(i.key));
          if (!items.length) return null;
          return (
            <section key={group.category} className="card shopping-group">
              <h3>{CATEGORY_LABEL[group.category]}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.key} className={checked.has(item.key) ? 'done' : ''}>
                    <label title={`Für: ${item.recipes.join(', ')}`}>
                      <input type="checkbox" checked={checked.has(item.key)} onChange={() => toggle(item.key)} />
                      <span className="amount">{formatAmount(item.amount, item.unit)}</span>
                      <span className="name">{item.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {total === 0 && <p className="muted">Keine Zutaten – der Plan ist leer.</p>}
    </div>
  );
}
