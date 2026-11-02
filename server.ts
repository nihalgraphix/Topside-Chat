import http from 'http';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import apiRouter from './server/routes/api';
import { AetherSocketServer } from './server/websocket';
import { createServer as createViteServer } from 'vite';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Basic middleware & CORS for cross-origin static deployments
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-User-Id, X-User-Email, X-User-Name, X-User-Username, X-User-Avatar, X-Admin-Pass'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static uploads serving
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // REST API routes
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '2.4.0',
      timestamp: new Date().toISOString(),
      platform: 'Aether Next-Gen Communications Mesh',
    });
  });

  const httpServer = http.createServer(app);

  // Attach WebSocket Server
  const socketServer = new AetherSocketServer(httpServer);

  // Vite middleware for development / static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ Aether Glassmorphic Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting Aether server:', err);
  process.exit(1);
});
