import { Env, jsonResponse, errorResponse, fetchAkTools, PagesFunction } from '../../utils';

interface StockItem {
  code: string;
  name: string;
  exchange: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) return jsonResponse({ items: [] });

  try {
    // 1. Try to get from D1 Cache
    let allStocks: StockItem[] = [];
    const cache = await context.env.DB.prepare('SELECT json, updated_at FROM stock_list_cache WHERE id = ?').bind('default').first<{ json: string; updated_at: number }>();

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Check if cache exists and is valid (less than 24h old)
    if (cache && cache.json && (now - cache.updated_at < oneDay)) {
      allStocks = JSON.parse(cache.json);
    } else {
      // 2. Fetch from Upstream (stock_info_a_code_name) if cache is missing or stale
      // AKShare endpoint: stock_info_a_code_name
      const rawData = await fetchAkTools('/api/public/stock_info_a_code_name', context.env);
      
      if (!Array.isArray(rawData)) {
          throw new Error('Invalid upstream data format');
      }

      // Standardize
      allStocks = rawData.map((item: any) => {
          const code = String(item.code || item['证券代码']);
          let exchange = 'SZ';
          if (code.startsWith('6')) exchange = 'SH';
          if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';
          
          return {
              code: code,
              name: String(item.name || item['证券简称']),
              exchange
          };
      });

      // 3. Write back to D1
      // Use explicit transaction or just run ensures data is saved
      await context.env.DB.prepare('INSERT OR REPLACE INTO stock_list_cache (id, json, updated_at) VALUES (?, ?, ?)')
        .bind('default', JSON.stringify(allStocks), now)
        .run();
    }

    // 4. Filter logic
    const upperKw = keyword.toUpperCase();
    // Prioritize: Code matches > Name matches
    const results = allStocks.filter((s: StockItem) => 
        s.code.includes(upperKw) || s.name.includes(upperKw)
    ).slice(0, 20);

    return jsonResponse({ items: results });

  } catch (e: any) {
    return errorResponse('Search Failed', e.message);
  }
};
