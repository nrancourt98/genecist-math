const express = require('express')
const crypto = require("crypto");
const app = express()
app.use(express.json())

const RNG_URL = process.env.RNG_URL || "http://localhost:4002/api"

async function getRandom() {
  const resp = await fetch(RNG_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "rand",
      params: { type: "u32", qty: 1 }
    })
  })

  const body = await resp.json()

  return body.result[0]
}

const HANDLERS = {
  async play(params) {
    const { req, round, game, god_data } = params


    // Cheat presets will be passed in `god_data` if present.
    // Here we simply override random number with predefined random number from cheat preset
    const random = (god_data && god_data.random !== undefined) ? god_data.random : await getRandom()

    if (random % 2 === 0) {
      const winAmount = req.bet * 2;

      // Win
      return {
        final: true,
        finance: [{
          bet: -req.bet,
          type: "betting",
          win_change: winAmount
        }],
        game,
        round,
        resp: { win: winAmount }
      }

    } else {
      // Lose
      return {
        final: true,
        finance: [{
          bet: -req.bet,
          type: "betting",
          win_change: 0,
        }],
        game,
        round,
        resp: { win: 0 }
      }
    }
  }
}

app.post('/api', async (req, res) => {
  const { id, method, params } = req.body

  const result = await HANDLERS[method](params)
  console.log(`
Called '${method}':
  Request: ${JSON.stringify(params)}
  Response: ${JSON.stringify(result)}
  `)

  res.setHeader("content-type", "application/json")
  res.status(200).send(JSON.stringify({ jsonrpc: "2.0", id, result }))
})

// In producation build(docker) the server should listen `*:80`, it's configured in the `Dockerfile` via env variable `BACKEND_PORT=80`.
// In local dev env the port here should be equal to the port specified in `config.yml` in `backend.url`.
const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT) : 4051
app.listen(port, () => {
  console.log(`Server started on port ${port}...`)
})

process.on('SIGINT', function () {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  // some other closing procedures go here
  process.exit(0);
});