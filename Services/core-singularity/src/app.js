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
const path = require('path')
const ssh = require('ssh2').Client
const PersistentObject = require('persistent-cache-object')
const kue = require('kue')
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'redis', type: String }
]

const options = cmdArgs(cmdOptions)
const api = '/api/v1'
const redisSettings = options.redis.split(':')
const queue = kue.createQueue({
	prefix: 'q',
	redis: {
		host: redisSettings[0]
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

// api urls
app.get(api + '/job/:id', async (req, res) => {
	res.status(200).send()
})

/*
 * {
 *		name: 'file-001.txt'
 *		type: ['singularity'|...],
 *		path: '/data/fdfdf',
 *		params: [],
 *		webhook: 'http://....',
 *		output: '/data/...',
 *	}
 */
app.post(api + '/job', async(req, res) => {
	const jobReq = req.body
	//if(!verifyJob(jobReq)) {
	//	res.status(400).send()
	//	return
	//}
	console.log("received job request: " + JSON.stringify(jobReq))
	const job = queue.create(jobReq.type, jobReq).save(err => {
		if( !err ) console.log( job.id )
	})
	res.status(200).send(jobReq)
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
			privateKey: require('fs').readFileSync("/home/reggie/.ssh/id_rsa")
		})
	})
}

sshCopy({
	host: 'pro.cyfronet.pl',
	user: 'plgcushing',
	path: '10M.dat'
}, {
	host: 'lisa.surfsara.nl',
	user: 'cushing',
	path: ''
}, null)

queue.process('singularity', (job, done) => {
	console.log("processing job: " + JSON.stringify(job))
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
