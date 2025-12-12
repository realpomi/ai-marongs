import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { reportRoutes } from './routes/report';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'gemini-api',
    version: '1.0.0',
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

// Routes
app.route('/api/report', reportRoutes);

// Error handling
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

// Not found
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

const port = process.env.PORT || 3000;

console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
