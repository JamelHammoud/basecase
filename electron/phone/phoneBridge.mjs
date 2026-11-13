const sendJson = async (res, value) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(await value));
};

function streamEvents(phone, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  const unsubscribe = phone.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));

  res.on('close', unsubscribe);
}

export function phoneBridgeMiddleware(phone) {
  const routes = new Map([
    ['POST /phone-pair', (_req, res) => sendJson(res, phone.pair())],
    ['POST /phone-unpair', (_req, res) => sendJson(res, phone.unpair())],
    ['GET /phone-state', (_req, res) => sendJson(res, phone.state())],
    ['GET /phone-events', (_req, res) => streamEvents(phone, res)],
  ]);

  return (req, res, next) => {
    const route = routes.get(`${req.method} ${(req.url ?? '/').split('?')[0]}`);

    if (!route) {
      next();

      return;
    }

    req.resume();
    route(req, res);
  };
}
