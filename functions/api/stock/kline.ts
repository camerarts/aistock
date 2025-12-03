import { Env, jsonResponse, KLineItem, PagesFunction } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const countStr = url.searchParams.get('count') || '200';
  const count = parseInt(countStr, 10);

  if (!code) return jsonResponse({ error: 'Missing code' }, 400);

  // Cache Strategy
  const cacheUrl = new URL(context.request.url);
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = (caches as any).default;

  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  // Construct Upstream URL manually to have full control and error reporting
  const baseUrl = context.env.AKTOOLS_BASE_URL || 'http://localhost:8000';
  const upstreamUrl = new URL('/api/public/stock_zh_a_hist', baseUrl);
  upstreamUrl.searchParams.append('symbol', code);
  // REMOVED: period=daily, adjust=... as requested

  try {
      const res = await fetch(upstreamUrl.toString(), {
        headers: {
          'Content-Type': 'application/json',
          ...(context.env.AKTOOLS_API_KEY ? { 'X-API-KEY': context.env.AKTOOLS_API_KEY } : {})
        }
      });

      if (!res.ok) {
        const text = await res.text();
        // Strict Error Reporting: Return upstream details
        return new Response(JSON.stringify({
            error: 'Upstream Failed',
            detail: {
                upstreamUrl: upstreamUrl.toString(),
                status: res.status,
                bodySnippet: text.slice(0, 200) // First 200 chars
            }
        }), { 
            status: 502, 
            headers: { 'Content-Type': 'application/json' } 
        });
      }

      const rawData: any = await res.json();

      if (!Array.isArray(rawData)) {
        return new Response(JSON.stringify({
            error: 'Invalid Data Format',
            detail: {
                message: 'Expected array from upstream',
                received: typeof rawData,
                upstreamUrl: upstreamUrl.toString()
            }
        }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }

      // Standardize: Map Chinese fields to internal format
      const items: KLineItem[] = rawData.map((d: any) => ({
          // FORCE YYYY-MM-DD: Take first 10 chars (handles "2023-01-01T00..." or "2023-01-01")
          t: String(d['日期']).substring(0, 10),
          o: parseFloat(d['开盘']),
          h: parseFloat(d['最高']),
          l: parseFloat(d['最低']),
          c: parseFloat(d['收盘']),
          v: parseFloat(d['成交量'])
      }));

      // Sort by date ascending (oldest to newest)
      items.sort((a, b) => a.t.localeCompare(b.t));

      // Slice: keep only the last N items
      const slicedItems = items.slice(-count);
      
      // Determine exchange (rough inference)
      let exchange = 'SZ';
      if (code.startsWith('6')) exchange = 'SH';
      if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';

      const data = {
          code,
          exchange,
          name: '', // Search fills this usually
          items: slicedItems
      };

      response = jsonResponse(data);
      
      // Cache for 10 minutes
      response.headers.set('Cache-Control', 'public, max-age=600');
      context.waitUntil(cache.put(cacheKey, response.clone()));
      
      return response;

  } catch (e: any) {
      return new Response(JSON.stringify({
          error: 'Internal Fetch Error',
          detail: {
              message: e.message,
              upstreamUrl: upstreamUrl.toString()
          }
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
