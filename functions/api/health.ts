import { Env, jsonResponse, fetchAkTools, PagesFunction } from '../utils';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const start = Date.now();
  let upstreamStatus = 'unknown';

  try {
    // Simple upstream check (fetching a small list or just root)
    // Note: Adjust path based on your actual AKTools endpoints
    // For MVP just check if we can reach it.
    await fetchAkTools('/', context.env); 
    upstreamStatus = 'ok';
  } catch (e) {
    upstreamStatus = 'fail';
  }

  return jsonResponse({
    ok: true,
    time: new Date().toISOString(),
    upstream: {
      status: upstreamStatus,
      latency: Date.now() - start
    }
  });
};