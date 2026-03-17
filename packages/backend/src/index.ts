import Fastify from 'fastify'
import cors from '@fastify/cors'

const app = Fastify({ logger: true })

await app.register(cors)

app.get('/health', async () => {
  return { status: 'ok' }
})

const port = Number(process.env.PORT) || 3000
await app.listen({ port, host: '0.0.0.0' })
