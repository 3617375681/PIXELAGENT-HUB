import 'dotenv/config';
import { createServer } from 'node:http';
import { createRecordsWebStack } from './recordsWebStack.js';

const stack = createRecordsWebStack(process.env);

createServer((req, res) => {
  void stack.handleRequest(req, res);
}).listen(stack.port, () => {
  stack.logServerStarted();
});
