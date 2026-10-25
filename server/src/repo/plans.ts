import type { DatabaseSync } from 'node:sqlite';
import type { Plan, PlanData, PlanSettings } from '../types.ts';

type Row = Record<string, any>;

function fromRow(row: Row): Plan {
  return {
    id: row.id,
    // Pläne von vor Einführung der Präferenzen haben das Feld nicht.
    settings: { preferences: [], ...JSON.parse(row.settings) },
    data: JSON.parse(row.data),
    checked: JSON.parse(row.checked),
    createdAt: row.created_at,
  };
}

export class PlanRepo {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  list(limit = 50): Plan[] {
    return (this.db.prepare('SELECT * FROM plans ORDER BY id DESC LIMIT ?').all(limit) as Row[]).map(fromRow);
  }

  get(id: number): Plan | null {
    const row = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  create(settings: PlanSettings, data: PlanData): Plan {
    const result = this.db
      .prepare('INSERT INTO plans (settings, data) VALUES (?, ?)')
      .run(JSON.stringify(settings), JSON.stringify(data));
    return this.get(Number(result.lastInsertRowid))!;
  }

  updateData(id: number, data: PlanData): Plan | null {
    const result = this.db.prepare('UPDATE plans SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
    return result.changes ? this.get(id) : null;
  }

  setChecked(id: number, checked: string[]): Plan | null {
    const result = this.db.prepare('UPDATE plans SET checked = ? WHERE id = ?').run(JSON.stringify(checked), id);
    return result.changes ? this.get(id) : null;
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM plans WHERE id = ?').run(id).changes > 0;
  }

  /** Rezept-IDs der letzten Pläne, damit neue Pläne für Abwechslung sorgen. */
  recentRecipeIds(planCount = 2): Set<number> {
    const ids = new Set<number>();
    for (const plan of this.list(planCount)) {
      for (const m of plan.data.meals) if (m.recipeId != null) ids.add(m.recipeId);
    }
    return ids;
  }
}
