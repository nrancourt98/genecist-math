const { createApp } = require("./app");

const app = createApp();

// In production (Docker) the server listens on *:80, configured via BACKEND_PORT=80 in
// the Dockerfile. In local dev this defaults to 4051, matching
// info/sample-game-main/config.yml's backend.url port.
const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 4051;
app.listen(port, () => {
  console.log(`Server started on port ${port}...`);
});

process.on("SIGINT", () => {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  process.exit(0);
});
