const _ = require('underscore')
const cmdArgs = require('command-line-args')
const express = require('express')
const crypto = require('crypto')
const app = express()
const http = require('http')
const bodyParser = require('body-parser')
//const io = require('socket.io')(server)
const request = require('request')
const rp = require('request-promise')
const events = require('events')
const randomstring = require('randomstring')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const os = require('os')
const path = require('path')
const md5 = require('md5')
const amqp = require('amqplib')
const amqp2 = require('amqplib')
const PersistentObject = require('persistent-cache-object');
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'host', alias: 'h', type: String},
	{ name: 'config', type: String},
	{ name: 'users', alias: 'u', type: String},
	{ name: 'redis', type: String },
	{ name: 'amqp', type: String }
]

const options = cmdArgs(cmdOptions)

// index dbs to keep list of files on storages.
const index = new PersistentObject('./index.db')
const xedni = new PersistentObject('./xedni.db')
// keep track of copy request states
const states = new PersistentObject('./states.db')

// list of user's public keys allowed to access the service. Used to check JWT signitature 
const users = require(options.users)
Object.keys(users).forEach(k => {
	const u = users[k]
	u.decodedPublicKey = decodeBase64(u.publicKey)
})

console.log("Users: " + JSON.stringify(users, null, 2))

// setup express http server
const httpServer = http.createServer(app)
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

const api = '/api/v1'

// load config
const serverPort = options.port || 4300
const amqpHost = options.amqp || 'localhost'
//const client = redis.createClient({
//	host: redisHost,
//	port: redisPort
//})

const getChannel = function(){
	let channel = null
	return async function() {
		if(channel) return new Promise((resolve, reject) => {
			resolve(channel)
		})
		return new Promise((resolve, reject) => {
			amqp.connect('amqp://' + amqpHost).then(conn => {
				conn.createChannel().then(function(ch) {
					const ex = 'function_proxy'
					const ok = ch.assertExchange(ex, 'direct', {durable: false})
					ok.then(() => {
						const publish = function(func, msg) {
							const rk = 'functions/' + func
							console.log('[INFO] publishing on ' + rk)
							ch.publish(ex, 'functions/' + func, Buffer.from(msg))
						}
						channel = publish
						resolve(publish)
					})
				})
			})
		})
	}
}()

const consumerHandler = function() {
	let channel = null
	return async function(func) {
		if(channel) return new Promise((resolve, reject) => {
			resolve(channel)
		})
		return new Promise((resolve, reject) => {
			amqp.connect('amqp://' + amqpHost).then(conn => {
				conn.createChannel().then(function(ch) {
					const ex = 'function_proxy'
					ch.assertExchange(ex, 'direct', {durable: false})
					.then(() => {
						ch.assertQueue('', {
							exclusive: true
						})
						.then((q) => {
							console.log(' [*] Waiting for ' + func + '. To exit press CTRL+C')
							ch.bindQueue(q.queue, ex, 'functions/' + func)
							
							channel = function(f) {
								ch.consume(q.queue, f)
							}
							resolve(channel)
							})
					})
				})
			})
		})
	}
}()

async function listen(func) {
	const ch = await consumerHandler(func)
	ch((msg) => {
		console.log(JSON.stringify(msg, 2, null))
	})
}

listen('response')


function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function decodeBase64(d) {
	return new Buffer(d, 'base64').toString()
}

/*function generateToken(user, namespace) {
	return jwt.sign({
		user: user,
		namespace: namespace || "default",
		date: new Date().toISOString()
	}, privateKey, {algorithm: 'RS256'})
}*/

function isEmpty(arr) {
	return arr.length === 0 ? true : false
}

function checkToken(req, res, next) {
	if (req.user) {
		next()
		return
	}
	const token = req.headers['x-access-token']
	if (!token) {
		res.status(403).send()
		return
	}
	const preDecoded = jwt.decode(token)
	if (!preDecoded) {
		res.status(403).send()
	}
	const user = preDecoded.email || preDecoded.user
	if(!users[user]) {
		res.status(403).send()
	}

	const cert = users[user].decodedPublicKey
	if (!cert) {
		res.status(403).send()
	}

	jwt.verify(token, cert, {algorithms: ['RS256']}, (err, decoded) => {
		if (err) {
			console.log(err)
			res.status(403).send()
			return
		}
		req['user'] = decoded.email
		next()
	})
}

//TODO remove
function checkAdminToken(req, res, next) {
	next()
	return
}

// function proxy
app.post(api + '/function/:func', async (req, res) => {
	const funcName = req.params.func
	const body = req.body
	const publish = await getChannel()
	publish(funcName, JSON.stringify(body))
	res.status(200).send()
})


console.log("Starting server...")
httpServer.listen(serverPort)
