// In production runner api always will be available at /api at the same domain as game.
// In dev - vite proxing requests to runner(see vite.config.js).
const API_URL = "/api"

class UnsuccessfulResponseError extends Error {
    constructor(response) {
        super(`Unsuccessful response: ${response.status}`)
        this.response = response
    }
}
class MethodCallError extends Error {
    constructor(error) {
        super(error.message || "call unsucessful")
        this.details = error.details
    }
}

async function rpcCall(method, params) {
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            id: window.crypto.randomUUID(),
            jsonrpc: "2.0",
            method,
            params
        })
    })
    console.log(resp)

    if (resp.status !== 200) {
        throw new UnsuccessfulResponseError(resp)
    }
    const respBody = await resp.json()
    if (respBody.error) {
        throw new MethodCallError(respBody.error)
    }

    return respBody.result
}

// Optimistic locking machinism to protect round state against concurrent requests(multi-tab playing within one game session, etc).
// Algorithm here is simple:
// 1. Each `init` and `play` response contains field `state_lock`
// 2. The game frontend saves it in the global variable `STATE_LOCK`
// 3. The game frontend sends `state_lock` field with the next `play` request containing the saved value.
// 4. If state lock differs from the one in the runner/platform - the request will be rejected with error.
// 4.1. The game frontend should show error to the player and reload the page to restore the actual state.
let STATE_LOCK = null

const API = {
    async init(token) {
        const result = await rpcCall("init", { token })
        STATE_LOCK = result.state_lock

        return result
    },

    async info(token) {
        return await rpcCall("info", { token })
    },

    async play(token, req) {
        const result = await rpcCall("play", { req, token, state_lock: STATE_LOCK })
        STATE_LOCK = result.state_lock

        return result
    }
}

export { API }