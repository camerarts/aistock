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
      // Calculate Dates: Get enough history to cover 'count' trading days
      // We ask for 2.5x calendar days to be safe against weekends/holidays
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - Math.ceil(count * 2.5)); 
      
      const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
      const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

      const rawData = await fetchAkTools('/api/public/stock_zh_a_hist', context.env, {
        symbol: code,
        period: 'daily',
        start_date: startStr,
        end_date: endStr,
        adjust: 'qfq'
      });

      // Standardize
      const items: KLineItem[] = rawData.map((d: any) => ({
          t: d['日期'],
          o: parseFloat(d['开盘']),
          h: parseFloat(d['最高']),
          l: parseFloat(d['最低']),
          c: parseFloat(d['收盘']),
          v: parseFloat(d['成交量'])
      })).sort((a: any, b: any) => a.t.localeCompare(b.t));

      // Slice to requested count
      const slicedItems = items.slice(-count);
      
      // Determine exchange (rough inference)
      let exchange = 'SZ';
      if (code.startsWith('6')) exchange = 'SH';
      if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';

      const data = {
          code,
          exchange,
          name: '', // Optional: Name is usually handled by search/cache, simplified here
          items: slicedItems
      };

      response = jsonResponse(data);
      
      // Cache for 10 minutes
      response.headers.set('Cache-Control', 'public, max-age=600');
      context.waitUntil(cache.put(cacheKey, response.clone()));
      
      return response;

  } catch (e: any) {
      return errorResponse('Fetch Kline Failed', e.message);
  }
};
