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
const randomstring = require('randomstring')
const path = require('path')
const redis = require('redis')
const ssh = require('ssh2').Client
const PersistentObject = require('persistent-cache-object')
const kue = require('kue')
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'redis', type: String }
]

const options = cmdArgs(cmdOptions)
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
const api = '/api/v1'
const serverPort = options.port || 4300
const redisHost = (options.redis) ? options.redis.split(':')[0] : '127.0.0.1'
const redisPort = (options.redis) ? (options.redis.split(':')[1] || 6379) : 6379
const client = redis.createClient({
	host: redisHost,
	port: redisPort
})
const states = new PersistentObject('./states.db')
const queue = kue.createQueue({
	prefix: 'l',
	redis: {
		host: redisHost,
		port: redisPort
	}
})
const httpServer = http.createServer(app)

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

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

app.get(api + '/status/:id', (req, res) => {
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
	if (body.status == 'done') {
		const uri = states[id].details.cmd.webhook.url
		delete states[id].details.callback
		console.log('post to webhook uri: ' + uri)
		request.post(uri, { json: states[id] }, (err, res) => {
			if (err) console.log(err)
		})
	}
})

// api urls
app.post(api + '/copy', async (req, res) => {
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

function sshCopy(src, dst, options) {

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
			privateKey: require('fs').readFileSync(process.env.HOME + "/.ssh/id_rsa")
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
