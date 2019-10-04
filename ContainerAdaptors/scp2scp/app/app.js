const YAML = require('yaml')
const _ = require('underscore')
const cmdArgs = require('command-line-args')
const express = require('express')
const app = express()
const http = require('http')
const https = require('https')
const bodyParser = require('body-parser')
//const io = require('socket.io')(server)
const request = require('request')
const rp = require('request-promise')
const events = require('events')
const fs = require('fs')
const os = require('os')
const path = require('path')
const redis = require('redis')
const ssh = require('ssh2').Client
const PersistentObject = require('persistent-cache-object')
const kue = require('kue')
const amqp = require('amqplib')
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'redis', type: String },
	{ name: 'users', alias: 'u', type: String},
	{ name: 'amqp', type: String },
	{ name: 'sshPrivateKey', type: String }
]

const options = cmdArgs(cmdOptions)

// list of user's public keys allowed to access the service. Used to check JWT signitature 
const users = (options.users) ? require(options.users) : {}
Object.keys(users).forEach(k => {
	const u = users[k]
	u.decodedPublicKey = decodeBase64(u.publicKey)
})

const api = '/api/v1'
const serverPort = options.port || 4300
const amqpHost = options.amqp || 'localhost'
const redisHost = (options.redis) ? options.redis.split(':')[0] : '127.0.0.1'
const redisPort = (options.redis) ? (options.redis.split(':')[1] || 6379) : 6379

// create job queue on redis
const queue = kue.createQueue({
	prefix: 'q',
	redis: {
		host: redisHost,
		port: redisPort
	}
})

// create REST service
const httpServer = http.createServer(app)
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

// setup mq consumer
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
					ch.assertExchange(ex, 'topic', {durable: false})
					.then(() => {
						ch.assertQueue('', {
							exclusive: true
						})
						.then((q) => {
							ch.bindQueue(q.queue, ex, 'functions.' + func)
							
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


function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function decodeBase64(d) {
	return new Buffer(d, 'base64').toString()
}

function isEmpty(arr) {
	return arr.length === 0 ? true : false
}

function isHiddenFile(filename) {
	if (!filename) return true
	return path.basename(filename).startsWith('.')
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

consumerHandler('*.scp2scp.copy').then(ch => {
	ch(msg => {
		const msgBody = JSON.parse(msg.content.toString())
		const copyReq = msgBody.body
		console.log(copyReq.cmd.type)
		queue.create('copy', copyReq).save(err => {
			if (err) {
				console.log(err)
				return
			}
			// send reply over msgq
		})

	})
})

// api urls
app.post(api + '/copy', checkToken, async (req, res) => {
	const copyReq = req.body
	if (copyReq.cmd.type == 'copy') {
		queue.create('copy', copyReq).save(err => {
			if (err) {
				console.log(err)
				res.status(500).send(err)
				return
			}
			res.status(200).send({
				id: copyReq.id,
				status: 'submitted'
			})
		})
	} else {
		res.status(400).send()
	}
})

function sshCopy(src, dst) {
	return new Promise((resolve, reject) => {
		const conn = new ssh()
		conn.on('error', (err) => {
			console.log(err)
			reject(err)
		})
		conn.on('ready', () => {
			console.log("[SSH] connected")
			const cmd = 'scp ' + src.path + " " + dst.user + '@' + dst.host + ":" + dst.path
			conn.exec(cmd, (err, stream) => {
				if (err) reject(err)
				stream.on('close', (code, signal) => {
					console.log("[SCP] close")
					conn.end()
					resolve({
						src: src,
						dst: dst
					})
				}).on('data', (data) => {
					console.log("[SCP STDOUT] " + data)
				}).stderr.on('data', (data) => {
					console.log("[SCP STDERR] " + data)
				})
			})
		}).connect({
			host: src.host,
			port: 22,
			username: src.user,
			//privateKey: require('fs').readFileSync(process.env.HOME + "/.ssh/id_rsa")
			privateKey: require('fs').readFileSync(options.sshPrivateKey)
		})
	})
}

/*sshCopy({
	host: 'pro.cyfronet.pl',
	user: 'plgcushing',
	path: '10M.dat'
}, {
	host: 'lisa.surfsara.nl',
	user: 'cushing',
	path: ''
}, null)*/

queue.process('copy', async (job, done) => {
	console.log("processing job: " + JSON.stringify(job))
	const type = job.data.cmd.subtype
	
	if (type == 'scp2scp') {
		const j = await(sshCopy(job.data.cmd.src, job.data.cmd.dst, null))
		console.log(j)
		const wh = job.data.cmd.webhook
		if (wh) {
			try{
				console.log("calling webhook")
				await rp.post(wh.url, {json: {
					id: job.data.id,
					status: 'done',
					details: job.data
				}})
			} catch(err) {
				console.log(err)
			}
		}
	}
	
	done()
})

queue.on('job enqueue', function(id, type){
	console.log( 'Job %s got queued of type %s', id, type );
}).on('job complete', function(id, result){
  kue.Job.get(id, function(err, job){
    if (err) return
    job.remove(function(err){
      if (err) throw err
      console.log('removed completed job #%d', job.id)
    })
  })
})

function verifyJob(job) {
	if (!job.name) return false
	if (!job.type) return false
	if (!job.path) return false
	if (!job.params) return false
	if (!job.webhook) return false
	if (!job.ouptut) return false

	return true
}

console.log("Starting server...")
httpServer.listen(options.port || 4300)

