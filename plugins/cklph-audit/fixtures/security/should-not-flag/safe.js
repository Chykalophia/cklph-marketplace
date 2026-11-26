const express = require('express')
const { Pool } = require('pg')
const app = express()
const pool = new Pool()

app.get('/users', async (req, res) => {
  const name = req.query.name
  try {
    const result = await pool.query('SELECT id, name FROM users WHERE name = $1', [name])
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'lookup failed' })
  }
})

app.get('/fetch', async (req, res) => {
  const allowed = ['https://api.github.com', 'https://api.stripe.com']
  let target
  try {
    target = new URL(String(req.query.url))
  } catch {
    return res.status(400).json({ error: 'URL not allowed' })
  }
  if (!allowed.includes(target.origin)) {
    return res.status(400).json({ error: 'URL not allowed' })
  }
  try {
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    const data = await response.text()
    res.set('X-Content-Type-Options', 'nosniff')
    res.type('application/json').send(data)
  } catch {
    res.status(502).json({ error: 'upstream failed' })
  }
})
