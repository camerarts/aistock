export const onRequestGet = async () => {
  return new Response(JSON.stringify({ ok: true, route: "/api/stock/kline" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
