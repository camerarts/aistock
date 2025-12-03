
export interface Stock {
  code: string;
  name: string;
  exchange: 'SH' | 'SZ' | 'BJ';
}

export interface KLine {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Rule {
  id: string;
  code: string;
  name: string;
  exchange: string;
  formula: string;
  enabled: number;
}

export interface Alert {
  id: string;
  code: string;
  name: string;
  trigger_date: string;
  message: string;
  created_at: number;
}

export interface DebugLog {
  id: string;
  url: string;
  method: string;
  status: string;
  duration: number;
  responsePreview: string;
}
