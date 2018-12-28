const YAML = require('yaml')
const amqp = require('amqplib')
const cmdArgs = require('command-line-args')
const { createClient} = require('webdav')
const express = require('express')
const crypto = require('crypto')
const app = express()
const http = require('http')
const https = require('https')
const bodyParser = require('body-parser')
//const io = require('socket.io')(server)
const request = require('request')
const rp = require('request-promise')
const events = require('events')
const mongoose = require('mongoose')
const randomstring = require('randomstring')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')
const PersistentObject = require('persistent-cache-object');
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'amqp', alias: 'q', type: String},
	{ name: 'mongo', alias: 'm', type: String},
	{ name: 'privateKey', alias: 'k', type: String},
	{ name: 'publicKey', alias: 'c', type: String},
	{ name: 'cert', alias: 's', type: String},
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'dbpass', type: String},
	{ name: 'host', alias: 'h', type: String},
	{ name: 'config', type: String}
]

const options = cmdArgs(cmdOptions)

//const index = new PersistentObject('./index.db', null, {'disableInterval': true})
//const xedni = new PersistentObject('./xedni.db', null, {'disableInterval': true})
const index = new PersistentObject('./index.db')
const xedni = new PersistentObject('./xedni.db')

// load keys
//const privateKey = fs.readFileSync(options.privateKey, "utf-8")
const publicKey = fs.readFileSync(options.publicKey, "utf-8")
//const cert = fs.readFileSync(options.cert, "utf-8")
//const credentials = {
//	key: privateKey,
//	cert: cert
//}

const config = JSON.parse(decodeBase64(options.config))
console.log("Starting with config: " + JSON.stringify(config, null, 2))

//const httpsServer = https.createServer(credentials, app)
const httpServer = http.createServer(app)

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

const api = '/api/v1'


// check mongo
/* const url = "mongodb://core-infra:" + options.dbpass + "@" + options.mongo + ":27017/process"
mongoose.connect(url)
const db = mongoose.connection
db.on('error', console.error.bind(console, "conn error"))
db.once('open', () => {
	console.log("mongodb ok");
})*/

function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function decodeBase64(d) {
	return new Buffer(d, 'base64').toString()
}

function generateToken(user, namespace) {
	return jwt.sign({
		user: user,
		namespace: namespace || "default",
		date: new Date().toISOString()
	}, privateKey, {algorithm: 'RS256'})
}

function isEmpty(arr) {
	return arr.length === 0 ? true : false
}

function checkToken(req, res, next) {
	next()
	const token = req.headers['x-access-token']
	if (!token) {
		res.status(403).send()
		return
	}
	jwt.verify(token, publicKey, {algorithms: ['RS256']}, (err, decoded) => {
		if (err) {
			res.status(403).send()
			return
		}
		req['user'] = decoded.email
		next()
	})
}

function checkAdminToken(req, res, next) {
	const token = req.headers['x-access-token']
	if (!token) {
		res.status(403).send()
		return
	}
	jwt.verify(token, publicKey, {algorithms: ['RS256']}, (err, decoded) => {
		if (err) {
			res.status(403).send()
			return
		}
		if (!(decoded.user == 'admin')) {
			res.status(403).send()
			return
		}
		req['user'] = decoded.user
		next()
	})
}

// my dump retry function
async function retry(fn, times, interval) {
	return new Promise((resolve, reject) => {
		let cnt = 0
		let i = setInterval(async function() {
			cnt = cnt + 1
			if (cnt > times) {
				console.log("Rejecting " + cnt)
				clearInterval(i)
				reject(false)
				return
			}
			try {
				await fn()
				clearInterval(i)
				resolve(true)
			} catch(err) {
				console.log(err.message)
			}
		}, interval)
	})
}

function isHiddenFile(filename) {
	if (!filename) return true
	return path.basename(filename).startsWith('.')
}

async function digg(p, host, client) {

	const dirItems = await client.getDirectoryContents(p)
	const dirs = dirItems
		.filter(i => i.type == 'directory')
		.map(i => i.filename)
	dirs.forEach(d => {
		console.log("Digging " + d)
		digg(d, host, client)
	})
	dirItems.filter(i => {
			return ( (i.type == 'file') && !(isHiddenFile(i.filename)) )
		})
		.forEach(f => {
			const base = path.basename(f.filename)
			if (!xedni[base]) {
				f.endpoints = [host]
				xedni[base] = f	
			} else {
				xedni[base].endpoints.push(host)
			}
			console.log(base)
		})
}

// load registry
async function loadRegistry() {

	config.forEach(async l => {
		retry(async function() {
			try{
				console.log("Querying " + l.name)
				const url = 'http://' + l.host + ":" + l.port
				const client = createClient(url, {})
				await digg('/', l, client)
				/*const dirItems = await client.getDirectoryContents("/")
				console.log("Items: " + JSON.stringify(dirItems))
				index[l.name] = dirItems
				dirItems
					.filter(i => {
						return ( (i.type == 'file') && !(isHiddenFile(i.filename)) )
						//return ( !(isHiddenFile(i.filename)) )
					})
					.forEach(f => {
						const base = path.basename(f.filename)
						f.details = l
						xedni[base] = f	
						console.log(base)
					})*/
			} catch(err) {
				throw(err)
			}
		}, 20, 5000)
	})
}

// mongodb
/*const userSchema = mongoose.Schema({
	email: String,
	namespace: String,
	keys: Object
})

const User = mongoose.model('Users', userSchema)

async function checkMongo() {
	const url = "mongodb://core-infra:core-infra@" + options.mongo + ":27017/process"
	console.log(url)
	mongoose.connect(url)
	const db = mongoose.connection
	db.on('error', console.error.bind(console, "conn error"))
	db.once('open', () => {
		console.log('connected')
	})
}*/

// rabbitmq
/*async function startMq() {
	const conn = await amqp.connect('amqp://' + options.amqp)
	const mq = await conn.createChannel()
	const q = await mq.assertQueue(null, {
		autoDelete: true
	})

	const rk = 'audit.transactions.*'
	const ex = 'audit'
	mq.assertExchange('audit', 'topic', {durable: false})
	mq.assertExchange('log', 'topic', {durable: false})
	console.log("Binding queue " + q.queue + " to rk: " + rk)
	await mq.bindQueue(q.queue, ex, rk)
	console.log("Binding queue " + l.queue + " to rk: log.*")
	await mq.bindQueue(l.queue, 'log', 'log.info.*')

	mq.consume(q.queue, (msg) => {
		eventEmitter.emit('audit_log', msg)
	})
}*/

// websockets
/*io.on('connection', function(client) {
    console.log('Client connected...')

    client.on('join', function(data) {
	        console.log(data)
	})

	eventEmitter.on('audit_log', (msg) => {
		const parts = msg.content.toString().split('.')
		const content = new Buffer(parts[0], 'base64').toString()
		console.log(content + " Signiture: " + parts[1])
		client.emit('audit_log', content)
	})
})*/

// api urls
app.get(api + '/test-user', checkToken, async (req, res) => {
	res.status(200).send(req.user)
})

app.get(api + '/test-service', async (req, res) => {
	res.status(200).send(req.user)
})

app.get(api + '/list', checkToken, async (req, res) => {
	res.status(200).send(xedni)
})
app.get(api + '/find/:id', checkToken, async (req, res) => {
	const filename = req.params.id
	const record = xedni[filename]
	if (!record) {
		res.status(404).send()
		return
	}
	res.status(200).send(record)
})

/* app.put(api + '/test-admin', checkAdminToken, async(req, res) => {
	res.status(200).send(req.user)
})*/

//const myToken = generateToken("r.s.cushing@uva.nl", "cushing-001")
//console.log(myToken)

loadRegistry()

//console.log("Starting secure server...")
//httpsServer.listen(options.port || 4343)
console.log("Starting server...")
httpServer.listen(options.port || 4300)
