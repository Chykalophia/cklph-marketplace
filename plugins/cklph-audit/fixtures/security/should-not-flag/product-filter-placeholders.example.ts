// FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: parameterized SQL that looks
// concatenated. The query is a template string with ${...} in it, but:
//   - the IN list interpolates only generated placeholders ($1, $2, ...), and every id travels in
//     the values array, after a digits-only check and a cap of 100
//   - the ORDER BY column comes from a fixed Map of three literals (a Map, so `__proto__` or
//     `constructor` cannot pull a prototype value in), and the direction is one of two literals
//   - the product catalog is public, so returning any product by id is intended
// Expected verdict: NO FINDING.
import type { Request, Response } from 'express';
import { Pool } from 'pg';

const pool = new Pool();

const SORT_COLUMNS = new Map([
  ['name', 'name'],
  ['created', 'created_at'],
  ['price', 'price_cents'],
]);

export async function listProducts(req: Request, res: Response) {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d{1,12}$/.test(s))
    .slice(0, 100);
  if (ids.length === 0) return res.json([]);

  const column = SORT_COLUMNS.get(String(req.query.sort ?? 'name')) ?? 'name';
  const direction = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

  const sql = `SELECT id, name, price_cents FROM products WHERE id IN (${placeholders}) ORDER BY ${column} ${direction}`;
  const result = await pool.query(sql, ids);
  return res.json(result.rows);
}
