import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocalServer } from '../../application/ports/local-server.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererDirectory = path.resolve(currentDirectory, '../../renderer');

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export class LocalHttpServer implements LocalServer {
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();

  start(): Promise<string> {
    if (this.server) {
      return Promise.reject(new Error('Local HTTP server is already running.'));
    }

    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handleRequest(request.url ?? '/', response);
      });

      this.server = server;
      server.on('connection', (socket) => {
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
      });
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Could not determine the local HTTP server port.'));
          return;
        }

        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;

    if (!server) {
      return Promise.resolve();
    }

    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    return new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handleRequest(url: string, response: import('node:http').ServerResponse) {
    try {
      const pathname = new URL(url, 'http://127.0.0.1').pathname;
      const requestedPath = pathname === '/' || pathname === '/overlay' ? '/index.html' : pathname;
      const filePath = path.resolve(rendererDirectory, `.${requestedPath}`);

      if (!filePath.startsWith(`${rendererDirectory}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        response.writeHead(404).end('Not Found');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
  }
}
