import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// ARCH-DECISION: In dev, Vite proxies each /api/v1/<entity> route directly to
// the responsible microservice. This eliminates the need to run the nginx
// api-gateway locally — just start postgres+redis in Docker and run services
// with pnpm. In production/staging, nginx handles all routing.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@haccp/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@haccp/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
      '@haccp/shared-errors': path.resolve(__dirname, '../../packages/shared-errors/src'),
      '@haccp/shared-validators': path.resolve(__dirname, '../../packages/shared-validators/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Auth service — :3010
      '/api/v1/auth':   { target: 'http://localhost:3010', changeOrigin: true },
      // User service — :3011 (users + groups)
      '/api/v1/users':  { target: 'http://localhost:3011', changeOrigin: true },
      '/api/v1/groups': { target: 'http://localhost:3011', changeOrigin: true },
      // Control service — :3012
      '/api/v1/controls': { target: 'http://localhost:3012', changeOrigin: true },
      // Nonconformity service — :3013
      '/api/v1/nonconformities': { target: 'http://localhost:3013', changeOrigin: true },
      // Asset service — :3014 (products, equipments, suppliers)
      '/api/v1/products':   { target: 'http://localhost:3014', changeOrigin: true },
      '/api/v1/equipments': { target: 'http://localhost:3014', changeOrigin: true },
      '/api/v1/suppliers':  { target: 'http://localhost:3014', changeOrigin: true },
      // Notification service — :3015 (REST + WebSocket)
      '/api/v1/notifications': { target: 'http://localhost:3015', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3015', ws: true, changeOrigin: true },
      // Report service — :3016
      '/api/v1/reports': { target: 'http://localhost:3016', changeOrigin: true },
      // DLC service — :3017
      '/api/v1/dlc': { target: 'http://localhost:3017', changeOrigin: true },
      // Tenant service — :3018 (tenants, sites, zones)
      '/api/v1/tenants': { target: 'http://localhost:3018', changeOrigin: true },
      '/api/v1/sites':   { target: 'http://localhost:3018', changeOrigin: true },
      '/api/v1/zones':   { target: 'http://localhost:3018', changeOrigin: true },
      // Audit service — :3019
      '/api/v1/audit': { target: 'http://localhost:3019', changeOrigin: true },
    },
  },
});
