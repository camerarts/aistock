
import { Env, jsonResponse, errorResponse, PagesFunction, checkD1Binding } from '../../utils';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  const id = context.params.id as string;
  try {
    const body: any = await context.request.json();
    const now = Date.now();
    
    // Construct dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    
    if (typeof body.enabled !== 'undefined') {
        updates.push('enabled = ?');
        values.push(body.enabled ? 1 : 0);
    }
    
    if (body.formula) {
        updates.push('formula = ?');
        values.push(body.formula);
    }
    
    updates.push('updated_at = ?');
    values.push(now);
    
    values.push(id); // For WHERE clause

    if (updates.length === 1) { // Only updated_at
        return jsonResponse({ success: true });
    }

    await context.env.DB.prepare(
        `UPDATE rules SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return jsonResponse({ success: true, id });
  } catch (e: any) {
    return errorResponse('Update Rule Failed', e.message);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  const id = context.params.id as string;
  try {
    await context.env.DB.prepare('DELETE FROM rules WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, id });
  } catch (e: any) {
    return errorResponse('Delete Rule Failed', e.message);
  }
};
