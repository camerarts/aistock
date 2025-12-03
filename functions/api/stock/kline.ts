import { Env, jsonResponse, errorResponse, fetchAkTools, KLineItem, PagesFunction } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const countStr = url.searchParams.get('count') || '200';
  const count = parseInt(countStr, 10);

  if (!code) return errorResponse('Missing code', null, 400);

  // Cache Strategy: Use Cloudflare Cache API
  // Key includes code and count to prevent mismatch
  const cacheUrl = new URL(context.request.url);
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = (caches as any).default;

  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  try {
      // Fetch from Upstream without calculating start/end dates
      // Params: symbol=CODE, period=daily, adjust= (empty)
      const rawData = await fetchAkTools('/api/public/stock_zh_a_hist', context.env, {
        symbol: code,
        period: 'daily',
        adjust: '' 
      });

      if (!Array.isArray(rawData)) {
        throw new Error('Upstream returned invalid data format (expected array)');
      }

      // Standardize
      const items: KLineItem[] = rawData.map((d: any) => ({
          t: d['日期'],
          o: parseFloat(d['开盘']),
          h: parseFloat(d['最高']),
          l: parseFloat(d['最低']),
          c: parseFloat(d['收盘']),
          v: parseFloat(d['成交量'])
      }));

      // Sort by date ascending
      items.sort((a, b) => a.t.localeCompare(b.t));

      // Slice to requested count (take the last N items)
      // If count is larger than length, it takes all
      const slicedItems = items.slice(-count);
      
      // Determine exchange (rough inference for frontend display)
      let exchange = 'SZ';
      if (code.startsWith('6')) exchange = 'SH';
      if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';

      const data = {
          code,
          exchange,
          name: '', // Name is usually handled by search context
          items: slicedItems
      };

      response = jsonResponse(data);
      
      // Cache for 10 minutes
      response.headers.set('Cache-Control', 'public, max-age=600');
      context.waitUntil(cache.put(cacheKey, response.clone()));
      
      return response;

  } catch (e: any) {
      // Return structured error, DO NOT mock
      return errorResponse('Fetch Kline Failed', e.message, 500);
  }
};
