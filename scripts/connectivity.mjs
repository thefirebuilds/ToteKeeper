const base = process.env.WEB_ORIGIN || 'http://127.0.0.1:5173'
const response = await fetch(base + '/api/health/')
if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('API proxy failed: ' + response.status)
console.log('Frontend /api proxy reached Django:', await response.text())
const missing = await fetch(base + '/api/not-a-real-endpoint/')
if (missing.status !== 404 || (await missing.text()).includes('/@vite/client')) throw new Error('Unknown API route fell through to SPA')
console.log('Unknown API routes remain backend 404s')
