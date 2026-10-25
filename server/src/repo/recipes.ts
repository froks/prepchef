import type { Database } from '../db.ts';
import type { Recipe, RecipeInput } from '../types.ts';

type Row = Record<string, any>;

function fromRow(row: Row): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    mealTypes: JSON.parse(row.meal_types),
    diet: row.diet,
    tags: JSON.parse(row.tags),
    ingredients: JSON.parse(row.ingredients),
    steps: JSON.parse(row.steps),
    nutrition: row.nutrition ? JSON.parse(row.nutrition) : null,
    fridgeDays: row.fridge_days,
    freezable: !!row.freezable,
    favorite: !!row.favorite,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toParams(r: RecipeInput) {
  return {
    title: r.title,
    description: r.description,
    servings: r.servings,
    meal_types: JSON.stringify(r.mealTypes),
    diet: r.diet,
    tags: JSON.stringify(r.tags),
    ingredients: JSON.stringify(r.ingredients),
    steps: JSON.stringify(r.steps),
    nutrition: r.nutrition ? JSON.stringify(r.nutrition) : null,
    fridge_days: r.fridgeDays,
    freezable: r.freezable ? 1 : 0,
    favorite: r.favorite ? 1 : 0,
    source_url: r.sourceUrl,
    image_url: r.imageUrl,
  };
}

export class RecipeRepo {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  list(): Recipe[] {
    return (this.db.prepare('SELECT * FROM recipes ORDER BY favorite DESC, title COLLATE NOCASE').all() as Row[]).map(fromRow);
  }

  get(id: number): Recipe | null {
    const row = this.db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as Row).n;
  }

  create(input: RecipeInput): Recipe {
    const result = this.db
      .prepare(
        `INSERT INTO recipes (title, description, servings, meal_types, diet, tags, ingredients, steps, nutrition,
           fridge_days, freezable, favorite, source_url, image_url)
         VALUES (:title, :description, :servings, :meal_types, :diet, :tags, :ingredients, :steps, :nutrition,
           :fridge_days, :freezable, :favorite, :source_url, :image_url)`,
      )
      .run(toParams(input));
    return this.get(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: RecipeInput): Recipe | null {
    const result = this.db
      .prepare(
        `UPDATE recipes SET title = :title, description = :description, servings = :servings, meal_types = :meal_types,
           diet = :diet, tags = :tags, ingredients = :ingredients, steps = :steps, nutrition = :nutrition,
           fridge_days = :fridge_days, freezable = :freezable, favorite = :favorite, source_url = :source_url,
           image_url = :image_url, updated_at = datetime('now')
         WHERE id = :id`,
      )
      .run({ ...toParams(input), id });
    return result.changes ? this.get(id) : null;
  }

  setFavorite(id: number, favorite: boolean): Recipe | null {
    const result = this.db.prepare('UPDATE recipes SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
    return result.changes ? this.get(id) : null;
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0;
  }
}
