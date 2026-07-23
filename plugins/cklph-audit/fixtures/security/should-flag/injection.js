const express = require('express')
const { Pool } = require('pg')
const app = express()
const pool = new Pool()

app.get('/users', async (req, res) => {
  const name = req.query.name
  const result = await pool.query(`SELECT * FROM users WHERE name = '${name}'`)
  res.json(result.rows)
})

app.get('/fetch', async (req, res) => {
  const url = req.query.url
  const response = await fetch(url)
  const data = await response.text()
  res.send(data)
})
