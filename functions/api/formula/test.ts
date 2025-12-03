
import { Env, jsonResponse, errorResponse, fetchAkTools, KLineItem, FormulaEngine, PagesFunction } from '../utils';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: any = await context.request.json();
    const { code, formula, count = 200 } = body;

    // Reuse KLine logic (internal fetch to avoid self-recursion HTTP overhead if possible, 
    // but for separation let's just use the shared fetch logic directly or fetch from Upstream again)
    // Better: Fetch upstream directly here to ensure freshness for testing.
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (count * 2));
    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

    const rawData = await fetchAkTools('/api/public/stock_zh_a_hist', context.env, {
        symbol: code,
        period: 'daily',
        start_date: startStr,
        end_date: endStr,
        adjust: 'qfq'
    });

    const items: KLineItem[] = rawData.map((d: any) => ({
        t: d['日期'],
        o: parseFloat(d['开盘']),
        c: parseFloat(d['收盘']),
        h: parseFloat(d['最高']),
        l: parseFloat(d['最低']),
        v: parseFloat(d['成交量'])
    })).sort((a:any,b:any) => a.t.localeCompare(b.t));

    const engine = new FormulaEngine(items);
    const result = engine.evaluate(formula);

    return jsonResponse(result);

  } catch (e: any) {
    return errorResponse('Formula Error', e.message, 400);
  }
};
