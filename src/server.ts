import { app } from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(
    `Usage Metering API running on port ${env.PORT}`
  );
});

// Gracefully stop accepting new connections.
process.on("SIGTERM", () => {
  console.log("Shutting down the server...");

  server.close(() => {
    process.exit(0);
  });
});