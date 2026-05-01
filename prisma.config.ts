import { config } from 'dotenv'
import { defineConfig } from '@prisma/config'

config({ path: '.env' })
config({ path: '.env.local', override: false })

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
