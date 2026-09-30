// Local API server for development. Vite proxies /api to this port.
import http from 'node:http';
import handler from '../api/index.js';

const port = process.env.API_PORT || 3001;
http.createServer((req, res) => handler(req, res)).listen(port, () => {
  console.log(`ATS API on http://localhost:${port}/api`);
});
