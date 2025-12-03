import { Env, jsonResponse, errorResponse, fetchAkTools, PagesFunction } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) return jsonResponse({ items: [] });

  try {
    // 1. Try to get from D1 Cache
    const cache = await context.env.DB.prepare('SELECT json, updated_at FROM stock_list_cache WHERE id = ?').bind('default').first<{ json: string; updated_at: number }>();
    let allStocks = [];

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (cache && (now - cache.updated_at < oneDay)) {
      allStocks = JSON.parse(cache.json);
    } else {
      // 2. Fetch from Upstream (stock_info_a_code_name)
      // AKShare endpoint: stock_info_a_code_name
      const rawData = await fetchAkTools('/api/public/stock_info_a_code_name', context.env);
      
      // Standardize
      allStocks = rawData.map((item: any) => {
          const code = item.code || item['证券代码'];
          let exchange = 'SZ';
          if (code.startsWith('6')) exchange = 'SH';
          if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';
          
          return {
              code: code,
              name: item.name || item['证券简称'],
              exchange
          };
      });

      // 3. Write back to D1
      await context.env.DB.prepare('INSERT OR REPLACE INTO stock_list_cache (id, json, updated_at) VALUES (?, ?, ?)')
        .bind('default', JSON.stringify(allStocks), now)
        .run();
    }

    // 4. Filter
    const upperKw = keyword.toUpperCase();
    const results = allStocks.filter((s: any) => 
        s.code.includes(upperKw) || s.name.includes(upperKw)
    ).slice(0, 20);

    return jsonResponse({ items: results });

  } catch (e: any) {
    return errorResponse('Search Failed', e.message);
  }
};