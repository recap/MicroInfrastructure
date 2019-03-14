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
const PersistentObject = require('persistent-cache-object')
const kue = require('kue')
const exec = require('child_process').exec
const eventEmitter = new events.EventEmitter()

    // TODO Put  proxy somewhere as input, maybe in the cmdOptions?
const cmdOptions = [
    { name: 'port', alias: 'p', type: Number},
    { name: 'adaptorId', type: String },
    { name: 'redis', type: String },
    { name: 'proxy', type: String }
]

const options = cmdArgs(cmdOptions)
if (!options.adaptorId) throw('adaptorId not set e.g. scp:data03.process-project.eu')
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
// TODO Below is redis section
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
    console.log(copyReq)
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('IPIP: ' + ip)
    if (copyReq.cmd.type == 'copy') {
// TODO Below is for redis
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
/* Below code is used to test srm2local without making use of queue and reddis */
//        srmLocalCopy(copyReq.cmd.src, copyReq.cmd.dst)
//        res.status(200).send({
//            id: copyReq.id,
//            status: 'submitted'
//        })
//    } else {
//        res.status(400).send()
    }
})

function srmcp(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {console.log('error:\n' + error); return resolve(false);}
            if (stdout) {console.log('stdout:\n' + stdout);}
            if (stderr) {console.log('stderr:\n' + stderr);}
            return resolve(true);
        });
    });
}

const srmLocalCopy = async function (src, dst) {
//    return new Promise((resolve, reject) => {
        console.log("Attempting srmcp command");
        proxyFile = options.proxy;
        surl = src.path;
        output = 'file:///' + dst.path;
        cmd = 'srmcp -server_mode=passive -x509_user_proxy=' + proxyFile + ' ' + surl + ' ' + output;
        console.log('Executing:\n  ' + cmd + '\n')
        result = await srmcp(cmd);
        console.log('RESULT: ' + result);
//    })
}

// TODO Below is for redis
queue.process('copy', async (job, done) => {
    console.log("processing job: " + JSON.stringify(job))
    const type = job.data.cmd.subtype
    if (type == 'srm2local') {
        const j = await(srmLocalCopy(job.data.cmd.src, job.data.cmd.dst));
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
httpServer.listen(options.port || 8002)
