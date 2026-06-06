require('dotenv').config()
const express = require('express')
const cors = require('cors')

const { router: authRouter } = require('./routes/auth')
const ocrRouter = require('./routes/ocr')
const expensesRouter = require('./routes/expenses')

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '20mb' }))

app.use('/api/auth',     authRouter)
app.use('/api/ocr',      ocrRouter)
app.use('/api/expenses', expensesRouter)

app.get('/api/health', (_, res) => res.json({ ok: true }))

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
