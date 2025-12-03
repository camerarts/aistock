

import { Env, jsonResponse, KLineItem, PagesFunction, checkD1Binding } from '../../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Check D1 Binding
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const countStr = url.searchParams.get('count') || '200';
  const count = parseInt(countStr, 10);

  if (!code) return jsonResponse({ error: 'Missing code' }, 400);

  // Cache Strategy
  const cacheUrl = new URL(context.request.url);
  const cacheKey = new Request(cacheUrl.toString(), context.request);
  const cache = (caches as any).default;

  // Try to find in cache first
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  // Determine exchange (rough inference)
  let exchange = 'SZ';
  if (code.startsWith('6')) exchange = 'SH';
  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';

  // Construct Upstream URL manually
  // Requirement: Only use symbol param, remove period/adjust
  const baseUrl = context.env.AKTOOLS_BASE_URL || 'http://localhost:8000';
  const upstreamUrl = new URL('/api/public/stock_zh_a_hist', baseUrl);
  upstreamUrl.searchParams.append('symbol', code);

  try {
      // Parallel execution: Fetch K-Line data AND Fetch Stock Name from Cache
      const [res, dbResult] = await Promise.all([
          fetch(upstreamUrl.toString(), {
            headers: {
              'Content-Type': 'application/json',
              ...(context.env.AKTOOLS_API_KEY ? { 'X-API-KEY': context.env.AKTOOLS_API_KEY } : {})
            }
          }),
          context.env.DB.prepare('SELECT json FROM stock_list_cache WHERE id = ?').bind('default').first<{ json: string }>()
      ]);

      if (!res.ok) {
        const text = await res.text();
        return new Response(JSON.stringify({
            error: 'Upstream Failed',
            detail: {
                upstreamUrl: upstreamUrl.toString(),
                status: res.status,
                bodySnippet: text.slice(0, 200)
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
      // STRICT REQUIREMENT: t must be YYYY-MM-DD (10 chars)
      const items: KLineItem[] = rawData.map((d: any) => ({
          t: String(d['日期']).slice(0, 10), 
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
      
      // Resolve Name
      let name = '';
      if (dbResult && dbResult.json) {
          try {
              const allStocks = JSON.parse(dbResult.json);
              const found = allStocks.find((s: any) => s.code === code);
              if (found) name = found.name;
          } catch (e) {
              // Ignore JSON parse errors for cache
          }
      }

      const data = {
          code,
          exchange,
          name, 
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
