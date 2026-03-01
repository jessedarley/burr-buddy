import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import createHandler from './api/create.js'
import messageHandler from './api/message.js'
import replyHandler from './api/reply.js'

function devApiPlugin() {
  const routes = new Map([
    ['/api/create', createHandler],
    ['/api/message', messageHandler],
    ['/api/reply', replyHandler],
  ])

  return {
    name: 'dev-api-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        const handler = routes.get(path)
        if (!handler) return next()

        Promise.resolve(handler(req, res)).catch((error) => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Internal server error.' }))
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiPlugin()],
})
