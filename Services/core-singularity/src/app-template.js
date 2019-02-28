const YAML = require('yaml')
const amqp = require('amqplib')
const cmdArgs = require('command-line-args')
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
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'amqp', alias: 'q', type: String},
	{ name: 'mongo', alias: 'm', type: String},
	{ name: 'privateKey', alias: 'k', type: String},
	{ name: 'publicKey', alias: 'c', type: String},
	{ name: 'cert', alias: 's', type: String},
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'dbpass', type: String},
	{ name: 'host', alias: 'h', type: String}
]

const options = cmdArgs(cmdOptions)

// load keys
const privateKey = fs.readFileSync(options.privateKey, "utf-8")
const publicKey = fs.readFileSync(options.publicKey, "utf-8")
const cert = fs.readFileSync(options.cert, "utf-8")
const credentials = {
	key: privateKey,
	cert: cert
}
const httpsServer = https.createServer(credentials, app)
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
		User.find(decoded.email, (err, results) => {
			if (err) throw err
			if (isEmpty(results)) {
				res.status(403).send()
				return
			}
			req['user'] = results[0]
			next()
		})
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

/* app.put(api + '/test-admin', checkAdminToken, async(req, res) => {
	res.status(200).send(req.user)
})*/

const myToken = generateToken("r.s.cushing@uva.nl", "cushing-001")
console.log(myToken)
console.log("Starting secure server...")
httpsServer.listen(options.port || 4243)
console.log("Starting server...")
httpServer.listen(options.port || 4200)
