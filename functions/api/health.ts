import { Env, jsonResponse, fetchAkTools, PagesFunction } from '../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const start = Date.now();
  let upstreamStatus = 'unknown';
  
  try {
      // Light probe to AkTools to check connectivity
      await fetchAkTools('/api/public/stock_zh_a_spot_em', context.env, { limit: '1' }); 
      upstreamStatus = 'ok';
  } catch (e) {
      upstreamStatus = 'fail';
  }
  
  return jsonResponse({
      ok: true,
      time: new Date().toISOString(),
      latency: Date.now() - start,
      upstream: { aktools: upstreamStatus }
  });
};
