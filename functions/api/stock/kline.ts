import { Env, jsonResponse, errorResponse, fetchAkTools, KLineItem, PagesFunction } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const countStr = url.searchParams.get('count') || '200';
  const count = Math.min(parseInt(countStr), 1000);

  if (!code) return errorResponse('Missing code', null, 400);

  // Cache Key (Simple In-Memory Logic via Cache API would go here, 
  // but for Pages Functions without Workers Cache binding explicit setup, 
  // we might rely on client-side or simple KV if available. 
  // Per requirements, we use "Cache API".
  
  const cacheUrl = new URL(context.request.url);
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = (caches as any).default;
  let response = await cache.match(cacheKey);

  if (response) {
    return response;
  }

  try {
    // Determine start date based on count (rough estimate: count * 1.5 days to account for weekends)
    // Actually AkShare stock_zh_a_hist takes start_date.
    // Let's just fetch a decent chunk. 
    // Calculating "Start Date" exactly is hard without a calendar. 
    // We will ask for a broad range or use 'period' if supported, 
    // but stock_zh_a_hist uses start_date. 
    
    // MVP Strategy: Fetch recent data. 
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (count * 2)); // rough lookback
    
    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

    // Upstream: stock_zh_a_hist
    const params = {
        symbol: code,
        period: 'daily',
        start_date: startStr,
        end_date: endStr,
        adjust: 'qfq' // Forward adjusted
    };

    const rawData = await fetchAkTools('/api/public/stock_zh_a_hist', context.env, params);
    
    // Map to standard items
    const items: KLineItem[] = rawData.map((d: any) => ({
        t: d['日期'],
        o: parseFloat(d['开盘']),
        c: parseFloat(d['收盘']),
        h: parseFloat(d['最高']),
        l: parseFloat(d['最低']),
        v: parseFloat(d['成交量'])
    }));

    // Validation
    const cleanItems = items.sort((a,b) => a.t.localeCompare(b.t));

    // Guess Exchange
    let exchange = 'SZ';
    if (code.startsWith('6')) exchange = 'SH';
    if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';

    const result = {
        code,
        name: '', // Info usually separate, user has it from search
        exchange,
        items: cleanItems.slice(-count) // Limit return
    };

    response = jsonResponse(result);
    
    // Set Cache Headers for Cloudflare Cache
    response.headers.append('Cache-Control', 's-maxage=600'); // 10 mins
    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (e: any) {
    return errorResponse('KLine Fetch Failed', { message: e.message, upstream: `${context.env.AKTOOLS_BASE_URL}` });
  }
};