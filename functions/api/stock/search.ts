
import { Env, jsonResponse, errorResponse, PagesFunction, checkD1Binding, initDb } from '../utils';

interface StockItem {
  code: string;
  name: string;
  exchange: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Check D1 Binding
  const dbError = checkD1Binding(context.env);
  if (dbError) return dbError;

  // AUTO-INIT: Ensure tables exist
  await initDb(context.env.DB);

  const url = new URL(context.request.url);
  const keyword = url.searchParams.get('keyword');

  if (!keyword) return jsonResponse({ items: [] });

  try {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const cacheKey = 'default';

    // 1. 尝试读取缓存 (包含过期缓存)
    let cacheData: { json: string; updated_at: number } | null = null;
    try {
        cacheData = await context.env.DB.prepare('SELECT json, updated_at FROM stock_list_cache WHERE id = ?')
            .bind(cacheKey)
            .first();
    } catch (e) {
        console.warn('Cache read failed:', e);
    }

    let allStocks: StockItem[] = [];
    let source = 'upstream';
    let cacheUpdatedAt: string | null = null;

    // 判定缓存是否有效
    const isCacheValid = cacheData && cacheData.json && (now - cacheData.updated_at < oneDay);

    if (isCacheValid) {
        // 场景A: 缓存有效 -> 直接使用
        source = 'cache';
        allStocks = JSON.parse(cacheData!.json);
        cacheUpdatedAt = new Date(cacheData!.updated_at).toISOString();
    } else {
        // 场景B: 缓存无效或不存在 -> 尝试请求上游
        
        // 优化：如果是 6 位纯数字代码且完全无缓存，跳过全量拉取，直接走轻量伪造
        // 避免冷启动时为了搜一个代码而去拉取 5000+ 股票导致超时
        if (!cacheData && /^\d{6}$/.test(keyword)) {
            source = 'synthetic-lite';
            // 简单推断交易所
            let exchange = 'SZ';
            if (keyword.startsWith('6')) exchange = 'SH';
            if (keyword.startsWith('8') || keyword.startsWith('4') || keyword.startsWith('9')) exchange = 'BJ';
            
            allStocks = [{ code: keyword, name: '未知(新)', exchange }];
        } else {
            // 需要拉取全量列表
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒强制超时

            try {
                const baseUrl = context.env.AKTOOLS_BASE_URL || 'http://localhost:8000';
                const apiUrl = new URL('/api/public/stock_info_a_code_name', baseUrl);
                
                // 发起请求
                const res = await fetch(apiUrl.toString(), {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(context.env.AKTOOLS_API_KEY ? { 'X-API-KEY': context.env.AKTOOLS_API_KEY } : {})
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error(`Upstream Status ${res.status}`);
                }

                const rawData: any = await res.json();
                if (!Array.isArray(rawData)) {
                    throw new Error('Upstream data is not an array');
                }

                // 清洗数据
                allStocks = rawData.map((item: any) => {
                    const code = String(item.code || item['证券代码'] || '');
                    const name = String(item.name || item['证券简称'] || '');
                    let exchange = 'SZ';
                    if (code.startsWith('6')) exchange = 'SH';
                    if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';
                    return { code, name, exchange };
                }).filter(s => s.code && s.name);

                source = 'upstream';

                // 异步写入缓存 (不阻塞返回)
                context.waitUntil(
                    context.env.DB.prepare('INSERT OR REPLACE INTO stock_list_cache (id, json, updated_at) VALUES (?, ?, ?)')
                        .bind(cacheKey, JSON.stringify(allStocks), now)
                        .run()
                        .catch(err => console.error('Cache write failed:', err))
                );

            } catch (e: any) {
                clearTimeout(timeoutId);
                console.error('Fetch failed:', e);

                // 降级策略：如果上游失败，但我们有“过期缓存”，则强制使用过期缓存
                if (cacheData && cacheData.json) {
                    source = 'cache-stale';
                    allStocks = JSON.parse(cacheData.json);
                    cacheUpdatedAt = new Date(cacheData.updated_at).toISOString();
                } else {
                    // 确实没救了
                    if (e.name === 'AbortError' || e.message === 'UPSTREAM_TIMEOUT') {
                        return jsonResponse({
                            error: "UPSTREAM_TIMEOUT",
                            detail: "Fetching stock list took too long",
                            upstreamUrl: context.env.AKTOOLS_BASE_URL,
                            hint: "try again or use cached list"
                        }, 504);
                    }
                    return errorResponse('Stock List Fetch Failed', e.message);
                }
            }
        }
    }

    // 2. 搜索过滤
    let results: StockItem[] = [];
    
    if (/^\d{6}$/.test(keyword)) {
        // 精确匹配代码
        results = allStocks.filter(s => s.code === keyword);
    } else {
        // 模糊匹配名称或代码
        const upperKw = keyword.toUpperCase();
        results = allStocks.filter(s => s.name.includes(upperKw) || s.code.includes(upperKw));
    }

    return jsonResponse({ 
        items: results.slice(0, 20),
        debug: {
            source,
            cacheUpdatedAt,
            total: allStocks.length
        }
    });

  } catch (e: any) {
    return errorResponse('Search Internal Error', e.message);
  }
};
