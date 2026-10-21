// Serves the built app (the dist folder) with nothing but Node.js 18 or later; no npm install.
//
//   node serve.mjs [--port 8080] [--host localhost] [--dir <folder>]
//
// By default it serves the folder it sits in, so it works after being copied into dist. Use
// --host 0.0.0.0 to let other machines on the network open the app.
//
// Files that exist are served as they are. Other paths without a file extension (/table-details,
// /relationships, ...) get index.html, because the app routes in the browser. Missing files with an
// extension get a real 404, which the app reads as "file not published".
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(option('dir', here));
const port = Number(option('port', process.env.PORT ?? 8080));
const host = option('host', 'localhost');

// The launcher and IIS files live beside the app in dist; never serve them.
const HIDDEN = new Set([
  'serve.mjs',
  'start.cmd',
  'start.sh',
  'readme.txt',
  'web.config',
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const isFile = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

function send(res, status, file, headers = {}) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(status, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

if (!(await isFile(path.join(root, 'index.html')))) {
  console.error(
    `serve: no index.html in ${root}. Run "npm run build" first or pass --dir.`,
  );
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
  } catch {
    res.writeHead(400);
    return res.end();
  }

  const file = path.resolve(root, '.' + pathname);
  const inside = file === root || file.startsWith(root + path.sep);
  if (!inside || pathname.includes('\0')) return notFound(res);
  if (HIDDEN.has(path.relative(root, file).toLowerCase())) return notFound(res);
  // Sample data is input to the offline documentation process only.
  if (pathname.toLowerCase().endsWith('.data.json')) return notFound(res);

  if (await isFile(file)) {
    // Hashed build assets never change; everything else (index.html, catalog files) is revalidated
    // so a newly copied catalog shows up on refresh.
    const immutable = pathname.startsWith('/assets/');
    return send(res, 200, file, {
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
  }

  if (path.extname(pathname)) return notFound(res);
  return send(res, 200, path.join(root, 'index.html'), {
    'Cache-Control': 'no-cache',
  });
});

server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `serve: port ${port} is in use. Try --port ${port + 1}.`
      : `serve: ${error.message}`,
  );
  process.exit(1);
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`SEH Intelligence Platform: http://${shown}:${port}/`);
  console.log(`Serving ${root}. Press Ctrl+C to stop.`);
});
