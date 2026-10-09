import 'dotenv/config';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createRecordsWebStack } from './recordsWebStack.js';
import { createDashboardHandler } from './dashboardServer.js';

const dashboard = process.argv.includes('--dashboard') ? await createDashboardHandler(resolve('dashboard/dist/public')) : undefined;
const stack = createRecordsWebStack(process.env);

createServer((req, res) => {
  void (async () => {
    if (dashboard && await dashboard(req, res)) return;
    await stack.handleRequest(req, res);
  })();
}).listen({ port: stack.port, ...(dashboard ? { host: '127.0.0.1' } : {}) }, () => {
  stack.logServerStarted();
  if (dashboard) console.log(`Dashboard: http://127.0.0.1:${stack.port}/studio`);
});
