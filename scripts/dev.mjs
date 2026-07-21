import { spawn } from "node:child_process";
import net from "node:net";

const port = 3100;
const host = "localhost";

async function assertPortAvailable(testHost) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRNOTAVAIL") {
        resolve();
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close(resolve);
    });
    server.listen({ host: testHost, port, exclusive: true });
  });
}

try {
  await Promise.all([
    assertPortAvailable("127.0.0.1"),
    assertPortAvailable("::1"),
  ]);
} catch (error) {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Padel Turni local dev requires http://${host}:${port}, but that port is already in use.`,
    );
    console.error("Free port 3100, then run `npm run dev` again.");
    process.exit(1);
  }
  throw error;
}

const child = spawn("next", ["dev", "--hostname", host, "--port", `${port}`], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
