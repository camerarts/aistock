

// --- Cloudflare Types Polyfill ---
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: any;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec<T = unknown>(query: string): Promise<D1Result<T>>;
}

export interface EventContext<Env, P extends string, Data> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException: () => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
}

export type PagesFunction<Env = unknown, Params extends string = any, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: EventContext<Env, Params, Data>
) => Response | Promise<Response>;

export interface Env {
  AKTOOLS_BASE_URL: string;
  AKTOOLS_API_KEY?: string;
  DB: D1Database;
}

export interface KLineItem {
  t: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// --- Standard Response Helper ---
export const jsonResponse = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const errorResponse = (error: string, detail: any = null, status = 500) => {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

// --- D1 Binding Check Helper ---
export const checkD1Binding = (env: Env) => {
  if (!env.DB) {
    return new Response(JSON.stringify({
        error: "D1_NOT_BOUND",
        detail: "Missing DB binding in Cloudflare Pages",
        hint: "Bind D1 as DB in Pages settings"
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
};

// --- AkTools Wrapper ---
export async function fetchAkTools(path: string, env: Env, params: Record<string, string> = {}) {
  const baseUrl = env.AKTOOLS_BASE_URL || 'http://localhost:8000'; // Fallback
  const url = new URL(path, baseUrl);
  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (env.AKTOOLS_API_KEY) headers['X-API-KEY'] = env.AKTOOLS_API_KEY;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`Upstream Error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (e: any) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// --- Formula Engine (TDX Subset) ---
export class FormulaEngine {
  private items: KLineItem[];
  private len: number;

  constructor(items: KLineItem[]) {
    // Safety check: ensure items is an array
    if (!Array.isArray(items)) {
        this.items = [];
    } else {
        this.items = items;
    }
    this.len = this.items.length;
  }

  // Get series array
  private getSeries(key: keyof KLineItem): number[] {
    return this.items.map(i => i[key] as number);
  }

  // Math Helpers
  private MA(series: number[], n: number): number[] {
    const res = new Array(this.len).fill(0);
    for (let i = 0; i < this.len; i++) {
      if (i < n - 1) {
        res[i] = NaN; 
        continue;
      }
      let sum = 0;
      for (let j = 0; j < n; j++) sum += series[i - j];
      res[i] = sum / n;
    }
    return res;
  }

  private EMA(series: number[], n: number): number[] {
    const res = new Array(this.len).fill(0);
    const k = 2 / (n + 1);
    // Initial SMA as first EMA or just first price
    let ema = series[0];
    res[0] = ema;
    for (let i = 1; i < this.len; i++) {
      ema = (series[i] * k) + (ema * (1 - k));
      res[i] = ema;
    }
    return res;
  }

  private REF(series: number[], n: number): number[] {
    const res = new Array(this.len).fill(NaN);
    for (let i = n; i < this.len; i++) {
      res[i] = series[i - n];
    }
    return res;
  }

  private HHV(series: number[], n: number): number[] {
    const res = new Array(this.len).fill(NaN);
    for (let i = 0; i < this.len; i++) {
      const start = Math.max(0, i - n + 1);
      let max = -Infinity;
      for(let j=start; j<=i; j++) max = Math.max(max, series[j]);
      res[i] = max;
    }
    return res;
  }

  private LLV(series: number[], n: number): number[] {
    const res = new Array(this.len).fill(NaN);
    for (let i = 0; i < this.len; i++) {
      const start = Math.max(0, i - n + 1);
      let min = Infinity;
      for(let j=start; j<=i; j++) min = Math.min(min, series[j]);
      res[i] = min;
    }
    return res;
  }

  private CROSS(a: number[], b: number[]): boolean[] {
    const res = new Array(this.len).fill(false);
    for(let i=1; i<this.len; i++) {
      res[i] = (a[i] > b[i]) && (a[i-1] <= b[i-1]);
    }
    return res;
  }

  // Very simple recursive parser/evaluator
  public evaluate(formula: string): { triggered: boolean, index: number, date: string, explain: string } {
    if (this.len === 0) {
        return { triggered: false, index: -1, date: '', explain: '无数据' };
    }

    try {
        // Replace known variables with data calls
        const O = this.getSeries('o');
        const H = this.getSeries('h');
        const L = this.getSeries('l');
        const C = this.getSeries('c');
        const V = this.getSeries('v');

        const context: any = {
           MA: this.MA.bind(this),
           EMA: this.EMA.bind(this),
           REF: this.REF.bind(this),
           HHV: this.HHV.bind(this),
           LLV: this.LLV.bind(this),
           CROSS: this.CROSS.bind(this),
           O, H, L, C, V
        };

        // Replace operator aliases
        let jsFormula = formula.toUpperCase()
            .replace(/AND/g, '&&')
            .replace(/OR/g, '||')
            .replace(/NOT/g, '!');
            
        // Dynamic Vector Evaluation
        const evalVector = new Function('ctx', `
            with(ctx) {
                return ${jsFormula};
            }
        `);
        
        const resultSeries = evalVector(context);
        
        let finalVal = false;
        if (Array.isArray(resultSeries)) {
             finalVal = !!resultSeries[this.len - 1];
        } else {
            finalVal = !!resultSeries;
        }

        const triggerDate = this.items[this.len - 1].t;

        return {
            triggered: finalVal,
            index: this.len - 1,
            date: triggerDate,
            explain: finalVal ? `触发于 ${triggerDate}` : '未触发'
        };

    } catch (e: any) {
        throw new Error(`公式错误: ${e.message}`);
    }
  }
}
