import autocannon from 'autocannon'
const url = process.env.LOAD_URL || 'http://127.0.0.1:4000/webhook/change-me-please'
const connections = Number(process.env.CONNECTIONS || 100)
const duration = Number(process.env.DURATION || 20)
const body = JSON.stringify({ update_id: 1, message: { message_id: 1, date: Math.floor(Date.now()/1000), text: '/start', chat: { id: 1, type: 'private' }, from: { id: 1, is_bot: false, first_name: 'Test', language_code: 'uz' } } })
autocannon({ url, method:'POST', headers:{ 'content-type':'application/json' }, connections, duration, body }, console.log)
