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

// load keys files
//const privateKey = fs.readFileSync(options.privateKey, "utf-8")
const publicKey = fs.readFileSync(options.publicKey, "utf-8")
//const cert = fs.readFileSync(options.cert, "utf-8")
//const credentials = {
//	key: privateKey,
//	cert: cert
//}

// load config indicating ip:ports of containers exposing webdav.
// TODO use some sort of service discovery instead
const config = JSON.parse(decodeBase64(options.config))
console.log("Starting with config: " + JSON.stringify(config, null, 2))
console.log("Users: " + JSON.stringify(users, null, 2))

// setup express http server
//const httpsServer = https.createServer(credentials, app)
const httpServer = http.createServer(app)
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

const api = '/api/v1'

// get list of local network interfaces
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

// load config
const serverPort = options.port || 4300
const redisHost = (options.redis) ? options.redis.split(':')[0] : '127.0.0.1'
const redisPort = (options.redis) ? (options.redis.split(':')[1] || 6379) : 6379

const client = redis.createClient({
	host: redisHost,
	port: redisPort
})


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

// a dumb retry function
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

// recursively go through directories and populate index dbs
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
			//TODO problem getting file hash since we do not want to load files to VMs
			//just to calculate hash.
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

	// query every webdav container to get file list
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

// return file list from index db
app.get(api + '/list', [checkAdminToken, checkToken], async (req, res) => {
	res.status(200).send(xedni)
})

// trigger an index update
app.get(api + '/updateregistry', [checkAdminToken, checkToken], async (req, res) => {
	loadRegistry()
	res.status(200).send()
})

// find a file from the index
app.get(api + '/find/:id', [checkAdminToken, checkToken], async (req, res) => {
	const filename = req.params.id
	const record = xedni[filename]
	if (!record) {
		res.status(404).send()
		return
	}
	res.status(200).send(record)
})

// check the status of a copy request
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

// internal test webhook
app.post(api + '/test-webhook/', (req, res) => {
	res.status(200).send()
	console.log("WEBHOOK: " + JSON.stringify(req.body))
})

// callback url used by the client containers doing the copying to call back once the file copy is done.
app.post(api + '/callback/:id', (req, res) => {
	const id = req.params.id
	const body = req.body

	res.status(200).send()
	if (!states[id]) {
		return
	}
	states[id]['status'] = body

	// calculate file transfer elapsed time
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

		// calling external webhook to indicate job has been done
		console.log('post to webhook uri: ' + uri)
		request.post(uri, { 
			headers: states[id].details.cmd.webhook.headers,
			json: states[id] 
		}, (err, res) => {
			if (err) console.log(err)
		})
	}
})

/* staging url e.g. input
 * [{
 *  "id": "test123",
 *   "cmd": {
 *       "type": "copy",
 *       "subtype": "scp2scp",
 *       "src":{
 *           "type": "scp",
 *           "host": "",
 *           "user": "",
 *           "path": "/mnt/dss/process/UC1/Camelyon16/TestData/Test_001.tif"
 *       },
 *       "dst":{
 *           "type": "scp",
 *           "host": "",
 *           "user": "",
 *           "path": "/nfs/scratch/cushing/UC1/"
 *       },
 *      "webhook": {
 *          "method": "POST",
 *           "url": "",
 *           "headers": {
 *           	"x-access-token": "asfsafdsfasda"
 *           }
 *       },
 *       "options": {}
 *   }
 *}]
 */
app.post(api + '/copy', [checkAdminToken, checkToken], async (req, res) => {
	if (!Array.isArray(req.body)) {
		res.status(400).send()
		return
	}
	// process array of file copy requests
	req.body.forEach(copyReq => {
		if (copyReq.cmd.type == 'copy') {
			// a key identifies which client container can handle the copying. 
			// The key is calculated as a combination of type and source host. 
			// This is set as --adaptorId parameter in the client container and 
			// published to redis.
			const key = copyReq.cmd.src.type + ":" + copyReq.cmd.src.host
			// fincd client container
			client.hgetall(key, async (err, ep) => {
				if (err) {
					console.log(err)
					return
				}
				// set timestamp, maybe should be set in the client container just before
				// actual data transfer to eliminate queueing time.
				copyReq.timestamp = new Date().toISOString()
				copyReq.callback = {
					port: serverPort,
					addresses: addresses,
					path: '/api/v1/callback/'
				}
				// try submitting copy request to IP:PORT
				const ips = ep.ips.split(',')
				for(i = 0; i < ips.length; i++) {
					const ip = ips[i]
					const url = ep.url.replace('#IPIP#', ip)
					console.log("trying ep: " + url)
					try {
						const result = await rp.post(url, {json: copyReq })
						if (result) {
							// update state db
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

//const loadRegistryInterval = setInterval(() => {
//	loadRegistry()
//}, 300000)

loadRegistry()

//console.log("Starting secure server...")
//httpsServer.listen(options.port || 4343)
console.log("Starting server...")
httpServer.listen(serverPort)
