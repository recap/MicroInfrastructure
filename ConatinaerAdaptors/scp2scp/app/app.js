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
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'adaptorId', type: String },
	{ name: 'redis', type: String },
	{ name: 'sshPrivateKey', type: String }
]

const options = cmdArgs(cmdOptions)
if (!options.adaptorId) throw('adaptorId not set e.g. scp:data03.process-project.eu')
console.log(options.sshPrivateKey)
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
const queue = kue.createQueue({
	prefix: 'q',
	redis: {
		host: redisHost,
		port: redisPort
	}
})
client.hmset(options.adaptorId, ['ips', addresses, 'url', 'http://#IPIP#:' + serverPort + '/api/v1/copy', 'timestamp', new Date().toISOString()])
client.hgetall(options.adaptorId, (err, reply) => {
	if (err) console.log(err)
	console.log(reply.url)
})
client.hmget(options.adaptorId, 'ips', (err, reply) => {
	if (err) console.log(err)
	console.log(reply)
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

// api urls
app.post(api + '/copy', async (req, res) => {
	const copyReq = req.body
	const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	console.log('IPIP: ' + ip)
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
		console.log("JOB: " + JSON.stringify(job))
		if (job.data.callback) {
			const cb = job.data.callback
			for (i = 0; i < cb.addresses.length; i++) {
				try {
					const url = 'http://' + cb.addresses[i] + ':' + cb.port + cb.path + job.data.id
					console.log('trying ' + url)
					await rp.post(url, {json: { 
						id: job.data.id,
						status: 'done',
						details: job.data
					}})
					break
				} catch(err) {}
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
