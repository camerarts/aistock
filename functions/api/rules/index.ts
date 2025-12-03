
import { Env, jsonResponse, errorResponse, PagesFunction, checkD1Binding } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  try {
    const { results } = await context.env.DB.prepare('SELECT * FROM rules ORDER BY created_at DESC').all();
    return jsonResponse({ items: results });
  } catch (e: any) {
    return errorResponse('List Rules Failed', e.message);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  try {
    const body: any = await context.request.json();
    const id = crypto.randomUUID();
    const now = Date.now();
    
    await context.env.DB.prepare(
      'INSERT INTO rules (id, code, exchange, name, formula, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.code, body.exchange, body.name, body.formula, body.enabled ? 1 : 0, now, now).run();

    return jsonResponse({ id, ...body });
  } catch (e: any) {
    return errorResponse('Create Rule Failed', e.message);
  }
};
