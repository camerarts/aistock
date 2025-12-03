

import { Env, jsonResponse, errorResponse, checkD1Binding, initDb, PagesFunction } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // 1. Check if DB is bound
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  try {
    // 2. Run the initialization script
    await initDb(context.env.DB);
    
    return jsonResponse({ 
        ok: true, 
        message: 'Database tables initialized successfully (stock_list_cache, rules, alerts).' 
    });
  } catch (e: any) {
    return errorResponse('Database Initialization Failed', e.message);
  }
};
