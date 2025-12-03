

import { Env, jsonResponse, errorResponse, PagesFunction, checkD1Binding, initDb } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  // Ensure table exists
  await initDb(context.env.DB);

  const { results } = await context.env.DB.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50').all();
  return jsonResponse({ items: results });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  // Ensure table exists
  await initDb(context.env.DB);

  const url = new URL(context.request.url);
  // Support clearing
  if (url.searchParams.has('clear')) {
      await context.env.DB.prepare('DELETE FROM alerts').run();
      return jsonResponse({ success: true });
  }

  // Support Creating (Internal usage mostly)
  const body: any = await context.request.json();
  const id = crypto.randomUUID();
  await context.env.DB.prepare(
      'INSERT INTO alerts (id, rule_id, code, exchange, name, trigger_date, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.rule_id, body.code, body.exchange, body.name, body.trigger_date, body.message, Date.now()).run();

  return jsonResponse({ id });
};
