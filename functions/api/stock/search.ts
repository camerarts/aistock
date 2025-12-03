import { Env, jsonResponse, errorResponse, fetchAkTools, PagesFunction } from '../../utils';

interface StockItem {
  code: string;
  name: string;
  exchange: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const keyword = url.searchParams.get('keyword');

  // 如果没有关键词，返回空数组
  if (!keyword) return jsonResponse({ items: [] });

  try {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // 1. 尝试从 D1 读取本地缓存
    // 表结构: stock_list_cache (id, json, updated_at)
    const cache = await context.env.DB.prepare('SELECT json, updated_at FROM stock_list_cache WHERE id = ?')
        .bind('default')
        .first<{ json: string; updated_at: number }>();

    let allStocks: StockItem[] = [];

    // 2. 检查缓存有效性 (存在且未过期)
    if (cache && cache.json && (now - cache.updated_at < oneDay)) {
        allStocks = JSON.parse(cache.json);
    } else {
        // 3. 缓存失效或不存在，请求上游 AKTools
        // 接口: /api/public/stock_info_a_code_name (获取A股全量代码简称)
        const rawData = await fetchAkTools('/api/public/stock_info_a_code_name', context.env);
        
        if (!Array.isArray(rawData)) {
            // 如果上游挂了或者返回错误，且我们有旧缓存，尽量用旧缓存顶一下
            if (cache && cache.json) {
                allStocks = JSON.parse(cache.json);
            } else {
                throw new Error('Upstream returned invalid data');
            }
        } else {
            // 4. 数据清洗与标准化
            allStocks = rawData.map((item: any) => {
                // 兼容不同版本的字段名 (code/证券代码, name/证券简称)
                const code = String(item.code || item['证券代码'] || '');
                const name = String(item.name || item['证券简称'] || '');
                
                // 简单的交易所推断逻辑
                let exchange = 'SZ';
                if (code.startsWith('6')) exchange = 'SH';
                if (code.startsWith('8') || code.startsWith('4') || code.startsWith('9')) exchange = 'BJ';
                
                return { code, name, exchange };
            }).filter(s => s.code && s.name); // 过滤无效数据

            // 5. 写入 D1 缓存 (异步写入，不阻塞查询返回，但为了逻辑简单这里await)
            // 使用 REPLACE 确保更新
            await context.env.DB.prepare('INSERT OR REPLACE INTO stock_list_cache (id, json, updated_at) VALUES (?, ?, ?)')
                .bind('default', JSON.stringify(allStocks), now)
                .run();
        }
    }

    // 6. 搜索匹配逻辑
    let results: StockItem[] = [];
    
    // 规则1: keyword 为 6 位数字 -> 优先精确匹配 code
    if (/^\d{6}$/.test(keyword)) {
        results = allStocks.filter(s => s.code === keyword);
    } else {
        // 规则2: 否则 -> 按 name 模糊匹配 (同时也稍微带上 code 模糊匹配以提升体验，如输入 "600")
        const upperKw = keyword.toUpperCase();
        results = allStocks.filter(s => s.name.includes(upperKw) || s.code.includes(upperKw));
    }

    // 只返回前 20 条
    return jsonResponse({ items: results.slice(0, 20) });

  } catch (e: any) {
    return errorResponse('Stock Search Failed', e.message);
  }
};
