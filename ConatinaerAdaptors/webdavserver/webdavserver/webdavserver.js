const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')

const config = require('./config.json')
const app = express()
const api = '/api/v1'
const fileDB = []

const jsDav = require('jsDAV/lib/DAV/server')
const jsDavLock = require('jsDAV/lib/DAV/plugins/locks/fs')

jsDav.createServer({
	node: '/data',
	locksBackend: jsDavLock.new('/tmp')
}, config.port, '0.0.0.0')

/*app.use(bodyParser.json())

app.get(api + '/dav/', (req, res) => {
	res.status(200).send()
})

app.copy(api + '/dav/', (req, res) => {
	res.status(202).send('copy')
})*/


//app.listen(config.port)

