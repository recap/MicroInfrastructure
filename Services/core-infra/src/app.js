const YAML = require('yaml')
const amqp = require('amqplib')
const cmdArgs = require('command-line-args')
const express = require('express')
const crypto = require('crypto')
const app = express()
const server = require('http').createServer(app)
const bodyParser = require('body-parser')
const io = require('socket.io')(server)
const request = require('request')
const rp = require('request-promise')
const events = require('events')
const mongoose = require('mongoose')
const randomstring = require('randomstring')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const k8s = require('k8s')
const ssh = require('ssh2').Client
const keypair = require('keypair')
const forge = require('node-forge')
const dockerNames = require('docker-names')
const md5 = require('md5')
const eventEmitter = new events.EventEmitter()

const cmdOptions = [
	{ name: 'amqp', alias: 'q', type: String},
	{ name: 'mongo', alias: 'm', type: String},
	{ name: 'privateKey', alias: 'k', type: String},
	{ name: 'publicKey', alias: 'c', type: String},
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'dbpass', type: String},
	{ name: 'host', alias: 'h', type: String}
]

const options = cmdArgs(cmdOptions)

// load keys
const privateKey = fs.readFileSync(options.privateKey, "utf-8")
const publicKey = fs.readFileSync(options.publicKey, "utf-8")

// check mongo
const url = "mongodb://core-infra:" + options.dbpass + "@" + options.mongo + ":27017/process"
mongoose.connect(url)
const db = mongoose.connection
db.on('error', console.error.bind(console, "conn error"))
db.once('open', () => {
	console.log("mongodb ok");
})

// check k8s
const kubeapi = k8s.api({
	endpoint: 'http://127.0.0.1:8080',
	version: '/api/v1'
})

const kubeext = k8s.api({
	endpoint: 'http://127.0.0.1:8080',
	version: '/apis/apps/v1'
})


kubeapi.get('namespaces/process-core/pods', (err, data) => {
	if (err) throw err
	data.items.forEach(d => {
		console.log("namespace: process-core, pod: " + d.metadata.name);
	})
})

function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function decodeBase64(d) {
	return new Buffer(d, 'base64').toString()
}

function createNamespace(name) {
	return {
	  "kind": "Namespace",
	  "apiVersion": "v1",
	  "metadata": {
		"name": name,
		"labels": {
		  "name": name
		}
	  }
	}
}

function createSecret(keys) {
	return {
	  "kind": "Secret",
	  "apiVersion": "v1",
	  "metadata": {
		  "name": "keys"
	  },
	  "type": "Opaque",
	  "data": {
		  "id_rsa": encodeBase64(keys.private),
		  "id_rsa.pub": encodeBase64(keys.public)
	  }
	}
}

function createUIJWTContainer(details) { 
	let cmd = ""

	const users = encodeBase64(JSON.stringify(details.users))

	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "SSH_HOST"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " echo $JWTUSERS | base64 -d > /assets/jwtusers && /bin/mkdir /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})

	cmd += " cd /root/webdavserver && node webdavserver-jwt.js"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-webdav:v0.3",
				"ports": [
					{
						"containerPort": 8001
					}
				],
				"env": [
					{ "name": "JWTUSERS", "value": users }
				],
				"securityContext": {
					"privileged": true,
						"capabilities": {
							"add": [ "SYS_ADMIN" ]
						}
				},
				"command": ["/bin/sh", "-c" ],
				"args": [cmd]
			}
}

function createUIContainer(details) { 
	let cmd = ""
	const htpass = details.user + ":jsdav:" + md5(details.user + ":jsdav:" + details.pass)
	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "SSH_HOST"
		})
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		cmd += " echo $HTDIGEST > /assets/htusers && /bin/mkdir /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})

	cmd += " cd /root/webdavserver && node webdavserver-ht.js"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-webdav:v0.3",
				"ports": [
					{
						"containerPort": 8000
					}
				],
				"env": [
					{ "name": "HTDIGEST", "value": htpass }
				],
				"securityContext": {
					"privileged": true,
						"capabilities": {
							"add": [ "SYS_ADMIN" ]
						}
				},
				"command": ["/bin/sh", "-c" ],
				"args": [cmd]
			}
}

function createContainer(details) {
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-sshfs:v0.1",
				"ports": [
					{
						"containerPort": details.containerPort
					}
				],
				"env": [
					{ "name": "SSH_USER", "value": details.sshUser },
					{ "name": "SSH_HOST", "value": details.sshHost },
					{ "name": "SSH_PORT", "value": details.sshPort },
					{ "name": "SSH_PATH", "value": details.sshPath }
				],
				"volumeMounts": [
					{ "name": "ssh-key", "mountPath": "/ssh", "readOnly": true },
					{ "name": "shared-data", "mountPath": "/shared-data" }
				],
				"securityContext": {
					"privileged": true,
						"capabilities": {
							"add": [ "SYS_ADMIN" ]
						}
				},
				"command": ["/bin/sh", "-c" ],
				"args": [ "/bin/cat /ssh/id_rsa > /root/.ssh/id_rsa && /bin/cat /ssh/id_rsa.pub > /root/.ssh/id_rsa.pub  && /bin/chmod 600 /root/.ssh/id_rsa && ssh  -o StrictHostKeyChecking=no $SSH_USER@$SSH_HOST ls && sshfs $SSH_USER@$SSH_HOST:$SSH_PATH /data && /bin/mkdir /shared-data/$SSH_HOST && cd /root/fileagent && node fileagent /data/ /shared-data/$SSH_HOST/ " + details.containerPort ]
			}
}

function createVolume(details) {
	// return default pod volumes
	return  [
      {
        "name": "ssh-key",
        "secret": {
          "secretName": "keys"
        }
      },
      {
        "name": "shared-data",
        "emptyDir": {}
      }
    ]
}

function createDeployment(details, volumes, containers) {
	return {
		kind: "Deployment",
		apiVersion: "apps/v1",
		metadata: {
			name: details.name,
			namespace: details.namespace,
			labels: {
				name: details.name
			}
		},
		spec: {
			selector: {
				  matchLabels: {
					app: details.name
				  }
				},
				template: {
				  metadata: {
					labels: {
					  app: details.name
					}
				  },
				  spec: {
					hostname: details.name,
					volumes: volumes,
					containers: containers
				  }
				}
		}
	}
}

function createService(details) {
	const name = (details.type == "webdav") ? details.name + '-ht' : details.name + '-jwt'
	return {
		kind: "Service",
		apiVersion: "v1",
		metadata: {
			name: name,
			namespace: details.namespace,
			labels: {
				app: details.name,
				type: details.type
			}
		},
		spec: {
			selector: {
				app: details.name
			},
			ports: [
				{
					port: details.targetPort,
					targetPort: details.targetPort
				}
			],
			type: "NodePort"
		}
	}
}

function createPod(details, containers) {
	return {
		"kind": "Pod",
		"apiVersion": "v1",
		"metadata": {
			"name": "mi" + randomstring.generate(5).toLowerCase(),
			"namespace": details.namespace
		},
		"spec":{
			"volumes": [
				{
					"name": "ssh-key",
					"secret": {
						"secretName": "keys"
					}
				},
				{
					"name": "shared-data",
					"emptyDir": {}
				}
			],
		"containers": containers
		}
	}
}

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(express.static('./'))
app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html')
})

const api = '/api/v1'

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

app.get(api + '/test', checkToken, async (req, res) => {
	res.status(200).send(req.user)
})

app.put(api + '/user', checkAdminToken, async(req, res) => {
	
	const user = req.body

	User.find({email: user.email}, async(err, results) => {
		if (err) {
			res.status(500).send()
			throw err
		}
		try {
			// generate user token
			const userToken = generateToken(user.email, user.namespace)	
			if (results.length === 0) {
				const iuser = user.email.split('@')[0]
				// generate user keys
				const keys = generateSshKeys(iuser)
				// create user mongo entry
				new User({
					email: user.email,
					namespace: user.namespace,
					keys: keys
				}).save()
				// initialize k8s namespace for user
				await kubeapi.post('namespaces', createNamespace(user.namespace))
				// create k8s secret with keys for user
				await kubeapi.post('namespaces/' + user.namespace + '/secrets', createSecret(keys))
				res.status(200).send({
					"token": userToken,
					"user": user.email
				})
			} else {
				res.status(200).send({
					"token": userToken,
					"user": user.email
				})
			}
		} catch(err) {
			console.log(err)
			res.status(500).send()
		}
	})
})

function checkSshConnection(adaptor) {
	return new Promise((resolve, reject) => {
		const conn = new ssh()
		conn.on('error', (err) => {
			resolve(false)
		})
		conn.on('ready', () => {
			resolve(true)
		}).connect({
			host: adaptor.host,
			username: adaptor.user,
			port: 22,
			privateKey: adaptor.keys.private
		})
	})

}

function copySshId(adaptor) {
	return new Promise((resolve, reject) => {
		const conn = new ssh()
		conn.on('error', (err) => {
			console.log("[SSH] ERRROR: " + err)
			reject(err)
		})
		conn.on('ready', () => {
			console.log("[SSH] connected to: " + adaptor.host);
			conn.sftp((err, sftp) => {
				if (err) reject(err)
				sftp.appendFile('.ssh/authorized_keys', adaptor.keys.public + '\n', (err) => {
					if (err) reject(err)
					console.log("[SSH] added key to: " + adaptor.host)
					resolve()
				})
			})
		}).connect({
			host: adaptor.host,
			username: adaptor.user,
			port: 22,
			//privateKey: req.user.keys.private
			password: adaptor.password || adaptor.pwd
		})
	})
}

async function getNamespaceServices(ns) {
	const res = await kubeapi.get('namespaces/' + ns + '/services')
	return res
}

function filterServices(services) {
	return services.map(s => {
		return {
			type:  s.metadata.labels.type,
			name:  s.metadata.name,
			ports: s.spec.ports.map(p => p.nodePort),
			host:  options.host
		}
	})
}

app.get(api + '/infrastructure', checkToken, async(req, res) => {
	const services = await getNamespaceServices(req.user.namespace)
	const info = filterServices(services.items)
	res.status(200).send(info)
})

app.delete(api + '/infrastructure/:id', checkToken, async(req, res) => {
	const id = req.params.id
	kubeext.delete('namespaces/' + req.user.namespace + '/deployments/' + id, (err, res) => {
		if (err) console.log(err)
	})
	kubeapi.delete('namespaces/' + req.user.namespace + '/services/' + id, (err, res) => {
		if (err) console.log(err)
	})

	res.status(200).send()

})

app.post(api + '/infrastructure', checkToken, async(req, res) => {
	const infra = req.body
	let cntPort = 3001
	const response = {}
	const services = []
	// convert description to k8s container list
	const promises = infra.adaptors.filter(adaptor => {
		return adaptor.type == "sshfs"
	}).map(async(adaptor, index) => {
		adaptor.keys = req.user.keys

		if(!(await checkSshConnection(adaptor))) {
			await copySshId(adaptor)
		} else {
			console.log("[SSH] key already present: " + adaptor.host)
		}

		const container = createContainer({
			namespace: req.user.namespace,
			containerPort: cntPort + index,
			sshHost: adaptor.host,
			sshPort: adaptor.port || '22',
			sshUser: adaptor.user,
			sshPath: adaptor.path
		})
		return container;
	})
	const containers = await Promise.all(promises)
	// convert ui descriptions to k8s container list
	const uiPromises = infra.ui.map(async(ui, index) => {
		const uicnt = []
		if (ui.type == "webdav") {
			const u = createUIContainer({
				adaptors: containers,
				user: ui.user,
				pass: ui.pass
			})
			const service = createService({
				name: infra.name,
				namespace: req.user.namespace,
				targetPort: 8000,
				type: 'webdav'
			})
			uicnt.push(u)
			services.push(service)
		}
		if (ui.type == "webdav-jwt") {
			const u = createUIJWTContainer({
				adaptors: containers,
				users: ui.users
			})
			const service = createService({
				name: infra.name,
				namespace: req.user.namespace,
				targetPort: 8001,
				type: 'webdav-jwt'
			})
			uicnt.push(u)
			services.push(service)
		}

		uicnt.forEach(c => containers.push(c))
	})

	const volumes = createVolume()
	const deployment = createDeployment({
		name: infra.name,
		namespace: req.user.namespace
	}, volumes, containers)

	try{
		// create k8s deployment
		await kubeext.delete('namespaces/' + req.user.namespace + '/deployments', deployment)
		await kubeext.post('namespaces/' + req.user.namespace + '/deployments', deployment)
		// create k8s services
		services.forEach(async s => {
			kubeapi.delete('namespaces/' + req.user.namespace + '/services/' + s.metadata.name, (err, res) => {
				if (err) console.log(err)
			})
			await kubeapi.post('namespaces/' + req.user.namespace + '/services', s)
		})
	} catch (err) {
		console.log("Error deploying: " + err)
	}

	let yml = ''

	services.forEach(s => {
		yml += YAML.stringify(s)
		yml += "---\n"
	})

	yml += YAML.stringify(deployment)

	const yamlFile = 'deployments/' + req.user.namespace + "." + infra.name + '.yaml'
	fs.writeFileSync(yamlFile, yml, 'utf-8')
	
	//const serviceList = await getNamespaceServices(req.user.namespace)
	//const info = filterServices(serviceList.items).filter(i => i.name == infra.name)
	res.status(200).send()
})

function deploy(desc) {
	const yamlFile = 'deployments/' + req.user.namespace + "." + infra.name + '.yaml'
	fs.writeFileSync(yamlFile, desc, 'utf-8')
}

const userSchema = mongoose.Schema({
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
}

async function startMq() {
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
}

io.on('connection', function(client) {
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
})

function generateSshKeys(user) {
	const pair = keypair();
	const publicSshKey = forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(pair.public), user + '@process-eu.eu')
	const privateSshKey = forge.ssh.privateKeyToOpenSSH(forge.pki.privateKeyFromPem(pair.private), user + '@process-eu.eu')
	return {
		public: publicSshKey,
		private: pair.private
	}
}

//startMq()
//checkMongo()
//const myToken = generateToken("admin")
const myToken = generateToken("r.s.cushing@uva.nl", "cushing-001")
console.log(myToken)
console.log("Starting server...")
server.listen(options.port || 4200)
