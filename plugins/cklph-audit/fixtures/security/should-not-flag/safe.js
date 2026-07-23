const express = require('express')
const { Pool } = require('pg')
const app = express()
const pool = new Pool()

app.get('/users', async (req, res) => {
  const name = req.query.name
  const result = await pool.query('SELECT * FROM users WHERE name = $1', [name])
  res.json(result.rows)
})

app.get('/fetch', async (req, res) => {
  const allowed = ['https://api.github.com', 'https://api.stripe.com']
  const url = req.query.url
  if (!allowed.some(a => url.startsWith(a))) {
    return res.status(400).json({ error: 'URL not allowed' })
  }
  const response = await fetch(url)
  const data = await response.text()
  res.send(data)
})
