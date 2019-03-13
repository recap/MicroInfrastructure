const YAML = require('yaml')
const _ = require('underscore')
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
const redis = require('redis')
const events = require('events')
const mongoose = require('mongoose')
const randomstring = require('randomstring')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const os = require('os')
const path = require('path')
const md5 = require('md5')
const PersistentObject = require('persistent-cache-object');
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'privateKey', alias: 'k', type: String},
	{ name: 'publicKey', alias: 'c', type: String},
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'host', alias: 'h', type: String},
	{ name: 'config', type: String},
	{ name: 'users', alias: 'u', type: String},
	{ name: 'redis', type: String }
]

const options = cmdArgs(cmdOptions)

//const index = new PersistentObject('./index.db', null, {'disableInterval': true})
//const xedni = new PersistentObject('./xedni.db', null, {'disableInterval': true})
const index = new PersistentObject('./index.db')
const xedni = new PersistentObject('./xedni.db')

const users = require(options.users)
Object.keys(users).forEach(k => {
	const u = users[k]
	u.decodedPublicKey = decodeBase64(u.publicKey)
})

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
console.log("Users: " + JSON.stringify(users, null, 2))

//const httpsServer = https.createServer(credentials, app)
const httpServer = http.createServer(app)

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

const api = '/api/v1'
const interfaces = os.networkInterfaces();
const addresses = ['127.0.0.1'];
for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
        const address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
        }
    }
}

const serverPort = options.port || 4300
const redisHost = (options.redis) ? options.redis.split(':')[0] : '127.0.0.1'
const redisPort = (options.redis) ? (options.redis.split(':')[1] || 6379) : 6379
const client = redis.createClient({
	host: redisHost,
	port: redisPort
})
const states = new PersistentObject('./states.db')

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
	if (req.user) {
		next()
		return
	}
	const token = req.headers['x-access-token']
	if (!token) {
		console.log("L")
		res.status(403).send()
		return
	}
	const preDecoded = jwt.decode(token)
	if (!preDecoded) {
		console.log("G")
		res.status(403).send()
	}
	const user = preDecoded.email || preDecoded.user
	if(!users[user]) {
		console.log("G")
		res.status(403).send()
	}

	const cert = users[user].decodedPublicKey
	if (!cert) {
		console.log("K")
		res.status(403).send()
	}

	jwt.verify(token, cert, {algorithms: ['RS256']}, (err, decoded) => {
		if (err) {
			console.log("P")
			console.log(err)
			res.status(403).send()
			return
		}
		req['user'] = decoded.email
		next()
	})
}

function checkAdminToken(req, res, next) {
	if (req.user) {
		next()
		return
	}
	const token = req.headers['x-access-token']
	if (!token) {
		res.status(403).send()
		return
	}
	jwt.verify(token, publicKey, {algorithms: ['RS256']}, (err, decoded) => {
		if (err) {
			next()
			return
		}
		if (!(decoded.user == 'admin')) {
			next()
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
		.filter(i => ( (i.type == 'directory') && !(isHiddenFile(i.filename)) ) )
		.map(i => i.filename)
	dirs.forEach(d => {
		digg(d, host, client)
	})
	dirItems.filter(i => {
			return ( (i.type == 'file') && !(isHiddenFile(i.filename)) )
		})
		.forEach(f => {
			//TODO change hashing system
			const dirtyHash = md5(f.basename + ":" + f.size)
			f.hash = dirtyHash
			const base = path.basename(f.filename)
			if (!xedni[base]) {
				xedni[base] = []
			}

			f.location = host
			const inThere = xedni[base].some(e => {
				return _.isEqual(e, f)
			})
			if (!inThere) {
				xedni[base].push(f)
			}
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
			} catch(err) {
				throw(err)
			}
		}, 20, 5000)
	})
}

// api urls
app.get(api + '/user', [checkAdminToken, checkToken], (req, res) => {
	res.status(200).send(req.user)
})

app.get(api + '/list', [checkAdminToken, checkToken], async (req, res) => {
	res.status(200).send(xedni)
})

app.get(api + '/updateregistry', [checkAdminToken, checkToken], async (req, res) => {
	loadRegistry()
	res.status(200).send()
})

app.get(api + '/find/:id', [checkAdminToken, checkToken], async (req, res) => {
	const filename = req.params.id
	const record = xedni[filename]
	if (!record) {
		res.status(404).send()
		return
	}
	res.status(200).send(record)
})

app.get(api + '/status/:id', [checkAdminToken, checkToken], (req, res) => {
	const id = req.params.id
	if (!id) {
		res.status(400).send()
		return
	}
	if (!states[id]) {
		res.status(404).send()
		return
	}
	res.status(200).send(states[id])
})

app.post(api + '/test-webhook/', (req, res) => {
	res.status(200).send()
	console.log("WEBHOOK: " + JSON.stringify(req.body))
})

app.post(api + '/callback/:id', (req, res) => {
	const id = req.params.id
	const body = req.body


	console.log('callback: ' + JSON.stringify(body))
	res.status(200).send()
	if (!states[id]) {
		return
	}
	states[id]['status'] = body
	if (states[id]['details'].timestamp) {
		const t2 = new Date()
		const t1 = new Date(states[id]['details'].timestamp)
		const delta = t2 - t1
		states[id]['details'].time = delta
	} else {
		states[id]['details'].time = null
	}
	if (body.status == 'done') {
		const uri = states[id].details.cmd.webhook.url
		delete states[id].details.callback
		delete states[id].status.details
		console.log('post to webhook uri: ' + uri)
		request.post(uri, { 
			headers: states[id].details.cmd.webhook.headers,
			json: states[id] 
		}, (err, res) => {
			if (err) console.log(err)
		})
	}
})

// api urls
app.post(api + '/copy', [checkAdminToken, checkToken], async (req, res) => {
	if (!Array.isArray(req.body)) {
		res.status(400).send()
		return
	}
	req.body.forEach(copyReq => {
		if (copyReq.cmd.type == 'copy') {
			// check delegate adaptor
			const key = copyReq.cmd.src.type + ":" + copyReq.cmd.src.host
			client.hgetall(key, async (err, ep) => {
				if (err) {
					console.log(err)
					return
				}
				copyReq.timestamp = new Date().toISOString()
				copyReq.callback = {
					port: serverPort,
					addresses: addresses,
					path: '/api/v1/callback/'
				}
				const ips = ep.ips.split(',')
				for(i = 0; i < ips.length; i++) {
					const ip = ips[i]
					const url = ep.url.replace('#IPIP#', ip)
					console.log("trying ep: " + url)
					try {
						const result = await rp.post(url, {json: copyReq })
						if (result) {
							states[copyReq.id] = {
								status: result,
								details: copyReq
							}
							break
						}
					} catch (err) {}
				}
			})
		}
	})
	res.status(200).send('OK')
})

//const myToken = generateToken("admin", "cushing-001")
//console.log(myToken)

//const loadRegistryInterval = setInterval(() => {
//	loadRegistry()
//}, 300000)

loadRegistry()

//console.log("Starting secure server...")
//httpsServer.listen(options.port || 4343)
console.log("Starting server...")
httpServer.listen(serverPort)
