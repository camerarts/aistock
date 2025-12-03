import React, { useState, useEffect, createContext, useContext } from 'react';
import { Stock, KLine, Rule, Alert, DebugLog } from './src/types';

// --- ICONS (Raw SVG) ---
const Icons = {
  Home: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Chart: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  List: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Settings: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Trash: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Bell: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
};

// --- GLOBAL CONTEXTS ---
const DebugContext = createContext<{ logs: DebugLog[]; addLog: (l: DebugLog) => void }>({ logs: [], addLog: () => {} });

// --- HOOKS ---
const useApi = () => {
  const { addLog } = useContext(DebugContext);

  const request = async (url: string, options: RequestInit = {}) => {
    const start = performance.now();
    const logId = Math.random().toString(36).substr(2, 9);
    let status = 'pending';
    let responseData: any = null;

    try {
      const res = await fetch(url, options);
      status = res.status.toString();
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('json')) {
        responseData = await res.json();
      } else {
        responseData = { text: await res.text() };
      }
      
      if (!res.ok) throw new Error(responseData?.error || res.statusText);
      return responseData;
    } catch (e: any) {
      status = 'ERROR';
      responseData = { error: e.message };
      throw e;
    } finally {
      const duration = Math.round(performance.now() - start);
      addLog({
        id: logId,
        url,
        method: options.method || 'GET',
        status,
        duration,
        responsePreview: JSON.stringify(responseData).slice(0, 100)
      });
    }
  };
  return { request };
};

// --- SHARED COMPONENTS ---

const DebugPanel = () => {
  const { logs } = useContext(DebugContext);
  const [open, setOpen] = useState(false);

  if (!open) return (
    <button 
      onClick={() => setOpen(true)} 
      className="fixed bottom-4 right-4 bg-white text-gray-500 border border-gray-200 p-2 rounded-full shadow hover:bg-gray-50 hover:text-gray-900 transition-all z-50"
      title="调试面板"
    >
      <Icons.Settings />
    </button>
  );

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-[400px] h-96 bg-white border-t md:border-l border-gray-200 shadow-2xl flex flex-col z-50">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-green-500"></span>
           <span className="font-bold text-xs text-gray-700">DEBUG CONSOLE</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-800">Close</button>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-[10px] bg-white">
        {logs.slice().reverse().map(log => (
          <div key={log.id} className="mb-2 p-2 rounded hover:bg-gray-50 border-b border-gray-50">
            <div className="flex gap-2 items-center mb-1">
              <span className={`px-1 rounded ${log.status === '200' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{log.status}</span>
              <span className="font-bold text-blue-600">{log.method}</span>
              <span className="text-gray-400 ml-auto">{log.duration}ms</span>
            </div>
            <div className="text-gray-600 truncate" title={log.url}>{log.url}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const KLineChart = ({ data }: { data: KLine[] }) => {
  if (!data || data.length === 0) return <div className="h-full w-full flex items-center justify-center text-gray-300 bg-gray-50 rounded-xl">暂无数据</div>;
  
  const height = 300;
  const width = 800; // SVG viewBox width
  const padding = 20;
  
  const prices = data.flatMap(d => [d.h, d.l]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  
  const candleWidth = (width - padding * 2) / data.length;
  const getY = (price: number) => height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);

  return (
    <div className="w-full h-full min-h-[300px]">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full bg-white rounded-xl">
         <line x1="0" y1={getY(minPrice)} x2={width} y2={getY(minPrice)} stroke="#f3f4f6" strokeDasharray="4" />
         <line x1="0" y1={getY(maxPrice)} x2={width} y2={getY(maxPrice)} stroke="#f3f4f6" strokeDasharray="4" />
         
         {data.map((d, i) => {
           const x = padding + i * candleWidth;
           const yOpen = getY(d.o);
           const yClose = getY(d.c);
           const yHigh = getY(d.h);
           const yLow = getY(d.l);
           const color = d.c >= d.o ? '#ef4444' : '#22c55e';
           return (
             <g key={d.t}>
               <line x1={x + candleWidth/2} y1={yHigh} x2={x + candleWidth/2} y2={yLow} stroke={color} strokeWidth="1" />
               <rect x={x + 1} y={Math.min(yOpen, yClose)} width={Math.max(0.5, candleWidth - 2)} height={Math.max(1, Math.abs(yOpen - yClose))} fill={color} />
             </g>
           );
         })}
         <text x="5" y="15" fill="#9ca3af" fontSize="10">{maxPrice.toFixed(2)}</text>
         <text x="5" y={height-5} fill="#9ca3af" fontSize="10">{minPrice.toFixed(2)}</text>
      </svg>
    </div>
  );
};

const StockSearch = ({ onSelect }: { onSelect: (s: Stock) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stock[]>([]);
  const { request } = useApi();

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.length < 2) return;
      try {
        const res = await request(`/api/stock/search?keyword=${query}`);
        setResults(res.items || []);
      } catch (e) {}
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative w-full max-w-md">
      <input 
        className="w-full bg-white text-gray-900 px-4 py-2.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm transition-all text-sm"
        placeholder="🔍 输入代码 (例如 600519)"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="absolute top-full left-0 w-full bg-white border border-gray-100 rounded-lg mt-1 z-20 max-h-60 overflow-y-auto shadow-xl">
          {results.map(s => (
            <div 
                key={s.code} 
                className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex justify-between border-b border-gray-50 last:border-0"
                onClick={() => { onSelect(s); setResults([]); setQuery(''); }}
            >
              <span className="font-bold text-blue-600 text-sm">{s.code}</span>
              <span className="text-gray-700 text-sm">{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- SUB-VIEWS ---

const HomeView = ({ alerts, refreshData }: { alerts: Alert[], refreshData: () => void }) => {
  const { request } = useApi();
  return (
    <div className="p-6 md:p-10 space-y-8 animate-in fade-in duration-300">
      <header>
         <h2 className="text-2xl font-bold text-gray-800">概览</h2>
         <p className="text-gray-400 text-sm mt-1">欢迎回来，系统运行正常。</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">今日预警</div>
            <div className="text-3xl font-bold text-gray-900">{alerts.filter(a => a.trigger_date === new Date().toISOString().split('T')[0]).length}</div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">历史通知</div>
            <div className="text-3xl font-bold text-gray-900">{alerts.length}</div>
         </div>
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-center">
            <div className="text-center">
               <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-2 animate-pulse"></div>
               <div className="text-sm text-gray-500">API 服务正常</div>
            </div>
         </div>
      </div>

      <section>
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold text-gray-800">最新通知</h3>
             <button onClick={async () => { await request('/api/alerts?clear=true', { method: 'POST' }); refreshData(); }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">清空通知</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
             {alerts.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm">暂无消息</div>
             ) : (
               <div className="divide-y divide-gray-50">
                 {alerts.map(a => (
                   <div key={a.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                      <div className="mt-1 p-1.5 bg-red-100 text-red-600 rounded-full">
                         <Icons.Bell />
                      </div>
                      <div>
                         <div className="flex items-baseline gap-2">
                            <span className="font-bold text-gray-900 text-sm">{a.name}</span>
                            <span className="text-xs text-gray-400 font-mono">{a.trigger_date}</span>
                         </div>
                         <p className="text-sm text-gray-600 mt-1">{a.message}</p>
                      </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
      </section>
    </div>
  );
};

const MarketView = ({ 
  stock, setStock, kline, formula, setFormula, testResult, handleTest, handleSaveRule 
}: any) => {
  return (
    <div className="p-4 md:p-8 h-full flex flex-col space-y-6 animate-in fade-in duration-300 overflow-y-auto">
       <div className="flex justify-between items-start">
         <div>
            <h2 className="text-2xl font-bold text-gray-800">市场行情</h2>
            <p className="text-gray-400 text-sm mt-1">分析股票走势与测试策略。</p>
         </div>
         <StockSearch onSelect={setStock} />
       </div>

       {/* Chart Area */}
       <div className="bg-white p-1 rounded-xl border border-gray-100 shadow-sm min-h-[350px] flex flex-col">
          {stock ? (
             <div className="p-5 flex-1 flex flex-col">
                 <div className="flex justify-between items-baseline mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{stock.name}</h3>
                        <div className="text-xs text-gray-400 font-mono">{stock.exchange} {stock.code}</div>
                    </div>
                    {kline.length > 0 && (
                        <div className={`text-3xl font-mono ${kline[kline.length-1].c >= kline[kline.length-1].o ? 'text-red-500' : 'text-green-500'}`}>
                           {kline[kline.length-1].c.toFixed(2)}
                        </div>
                    )}
                 </div>
                 <div className="flex-1 w-full">
                    <KLineChart data={kline} />
                 </div>
             </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                <Icons.Chart />
                <span className="mt-2 text-sm">请搜索股票查看行情</span>
             </div>
          )}
       </div>

       {/* Editor Area */}
       {stock && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col">
               <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">策略公式</h3>
                  <button onClick={handleSaveRule} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors">保存为规则</button>
               </div>
               <textarea 
                  className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-sm text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none min-h-[120px]"
                  value={formula}
                  onChange={e => setFormula(e.target.value)}
                  spellCheck={false}
               />
               <button onClick={handleTest} className="mt-4 w-full bg-gray-900 text-white py-2 rounded-lg text-sm hover:bg-black transition-colors shadow-lg shadow-gray-200">运行测试</button>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col">
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">运行结果</h3>
               {testResult ? (
                  <div className="font-mono text-sm space-y-3">
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">触发状态</span>
                        <span className={`font-bold ${testResult.triggered ? 'text-red-500' : 'text-gray-300'}`}>
                            {testResult.triggered ? 'TRIGGERED' : 'PASS'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">检测日期</span>
                        <span className="text-gray-800">{testResult.date}</span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded text-gray-600 text-xs">
                        {testResult.explain}
                      </div>
                  </div>
               ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">
                     点击运行查看结果
                  </div>
               )}
            </div>
         </div>
       )}
    </div>
  );
};

const RulesView = ({ rules, handleToggleRule, handleDeleteRule, handleCheckAll }: any) => {
  return (
    <div className="p-6 md:p-10 space-y-6 animate-in fade-in duration-300">
      <header className="flex justify-between items-center">
         <div>
            <h2 className="text-2xl font-bold text-gray-800">指标管理</h2>
            <p className="text-gray-400 text-sm mt-1">管理自动监控的交易策略。</p>
         </div>
         <button onClick={handleCheckAll} className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-blue-200 shadow-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            立即检查所有
         </button>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium">
               <tr>
                  <th className="px-6 py-4">股票</th>
                  <th className="px-6 py-4">策略公式</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4 text-right">操作</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
               {rules.map((r: Rule) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors group">
                     <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{r.code}</div>
                     </td>
                     <td className="px-6 py-4">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-600">{r.formula}</code>
                     </td>
                     <td className="px-6 py-4">
                        <button 
                           onClick={() => handleToggleRule(r)}
                           className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.enabled ? 'bg-green-500' : 'bg-gray-200'}`}
                        >
                           <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ${r.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                     </td>
                     <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDeleteRule(r.id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors">
                           <Icons.Trash />
                        </button>
                     </td>
                  </tr>
               ))}
               {rules.length === 0 && (
                  <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-gray-400">暂无策略，请前往“行情”页面添加。</td>
                  </tr>
               )}
            </tbody>
         </table>
      </div>
    </div>
  );
};

const SettingsView = () => {
    return (
        <div className="p-6 md:p-10 space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold text-gray-800">设置</h2>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-gray-50 pb-4">
                    <div>
                        <div className="font-bold text-gray-800">系统信息</div>
                        <div className="text-sm text-gray-500">Cloudflare Pages + D1 Database</div>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Online</span>
                </div>
                <div className="pt-2">
                    <p className="text-sm text-gray-400">更多设置项正在开发中...</p>
                </div>
            </div>
        </div>
    )
}

// --- MAIN LAYOUT & LOGIC ---

export default function App() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const addLog = (l: DebugLog) => setLogs(prev => [...prev.slice(-49), l]);

  // Tab State
  const [activeTab, setActiveTab] = useState<'home' | 'market' | 'rules' | 'settings'>('home');

  // Shared Data State
  const { request } = useApi();
  const [stock, setStock] = useState<Stock | null>(null);
  const [kline, setKline] = useState<KLine[]>([]);
  const [formula, setFormula] = useState('C > MA(C, 20)');
  const [testResult, setTestResult] = useState<any>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Initial Load
  const refreshData = async () => {
      try {
        const r = await request('/api/rules');
        setRules(r.items || []);
        const a = await request('/api/alerts');
        setAlerts(a.items || []);
      } catch(e) { console.error(e); }
  };
  useEffect(() => { refreshData(); }, []);

  // Stock Logic
  useEffect(() => {
    if (!stock) return;
    (async () => {
        try {
            const res = await request(`/api/stock/kline?code=${stock.code}`);
            setKline(res.items);
            setStock(prev => ({ ...prev!, exchange: res.exchange }));
            setTestResult(null);
        } catch(e) {}
    })();
  }, [stock?.code]);

  // Handlers
  const handleTest = async () => {
      if (!stock) return;
      try {
          const res = await request('/api/formula/test', {
              method: 'POST',
              body: JSON.stringify({ code: stock.code, formula })
          });
          setTestResult(res);
      } catch(e) { setTestResult({ error: 'Failed' }); }
  };

  const handleSaveRule = async () => {
      if (!stock) return;
      await request('/api/rules', {
          method: 'POST',
          body: JSON.stringify({ code: stock.code, name: stock.name, exchange: stock.exchange, formula, enabled: true })
      });
      refreshData();
      alert('规则已保存');
  };

  const handleToggleRule = async (rule: Rule) => {
      await request(`/api/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      refreshData();
  };

  const handleDeleteRule = async (id: string) => {
      if (!confirm('确定删除?')) return;
      await request(`/api/rules/${id}`, { method: 'DELETE' });
      refreshData();
  };

  const handleCheckAll = async () => {
      let count = 0;
      for (const rule of rules) {
          if (!rule.enabled) continue;
          try {
             const res = await request('/api/formula/test', { method: 'POST', body: JSON.stringify({ code: rule.code, formula: rule.formula, count: 50 }) });
             if (res.triggered) {
                 await request('/api/alerts', {
                     method: 'POST',
                     body: JSON.stringify({ rule_id: rule.id, code: rule.code, name: rule.name, exchange: rule.exchange, trigger_date: res.date, message: `触发: ${rule.formula}` })
                 });
                 count++;
             }
          } catch(e) {}
      }
      refreshData();
      alert(`检查完毕，触发 ${count} 条`);
  };

  return (
    <DebugContext.Provider value={{ logs, addLog }}>
      <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
        
        {/* SIDEBAR */}
        <aside className="w-20 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 z-10">
           {/* Logo Area */}
           <div className="h-16 flex items-center justify-center border-b border-gray-50">
               <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-blue-200 shadow-md">Q</div>
           </div>
           
           <nav className="flex-1 py-4 px-2 space-y-2 flex flex-col items-center">
               <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Icons.Home />} label="首页" />
               <NavButton active={activeTab === 'market'} onClick={() => setActiveTab('market')} icon={<Icons.Chart />} label="行情" />
               <NavButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} icon={<Icons.List />} label="指标" />
           </nav>

           {/* Bottom Actions */}
           <div className="p-2 pb-6 flex flex-col items-center">
               <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Icons.Settings />} label="设置" />
           </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-auto relative">
           {activeTab === 'home' && <HomeView alerts={alerts} refreshData={refreshData} />}
           
           {activeTab === 'market' && (
             <MarketView 
                stock={stock} setStock={setStock} 
                kline={kline} 
                formula={formula} setFormula={setFormula}
                testResult={testResult} 
                handleTest={handleTest}
                handleSaveRule={handleSaveRule}
             />
           )}

           {activeTab === 'rules' && (
             <RulesView 
                rules={rules} 
                handleToggleRule={handleToggleRule} 
                handleDeleteRule={handleDeleteRule}
                handleCheckAll={handleCheckAll}
             />
           )}

           {activeTab === 'settings' && <SettingsView />}
        </main>

        <DebugPanel />
      </div>
    </DebugContext.Provider>
  );
}

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-200 group ${
      active 
       ? 'bg-blue-50 text-blue-600 font-medium shadow-sm' 
       : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <span className={`${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
        {icon}
    </span>
    <span className="text-[10px] md:text-[10px]">{label}</span>
  </button>
);