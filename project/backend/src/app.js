// Express app definition, kept separate from index.js's "start listening" side effect so
// tests can mount it on an ephemeral port in-process (see tests/integration/).

const express = require("express");
const { handlePlay } = require("./playHandler");
const { ENABLED: GOD_MODE_ENABLED } = require("./godMode");

const HANDLERS = { play: handlePlay };

function createApp() {
  const app = express();
  app.use(express.json());

  // Dev-only: lets a browser page (e.g. visualizer/index.html's live mode) call this
  // endpoint directly cross-origin. Gated behind the same opt-in flag as god_data itself -
  // never enabled in the real shipped container, since nothing there needs it.
  if (GOD_MODE_ENABLED) {
    app.use((req, res, next) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "content-type");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  app.post("/api", async (req, res) => {
    const { id, method, params } = req.body;
    const handler = HANDLERS[method];

    if (!handler) {
      res.status(200).json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
      return;
    }

    try {
      const result = await handler(params);
      console.log(`Called '${method}':\n  Request: ${JSON.stringify(params)}\n  Response: ${JSON.stringify(result)}`);
      res.status(200).json({ jsonrpc: "2.0", id, result });
    } catch (err) {
      console.error(`Error handling '${method}':`, err);
      res.status(200).json({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
    }
  });

  return app;
}

module.exports = { createApp };
