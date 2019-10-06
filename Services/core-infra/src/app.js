const YAML = require('yaml')
const cmdArgs = require('command-line-args')
const express = require('express')
const crypto = require('crypto')
const app = express()
const http = require('http')
const https = require('https')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const randomstring = require('randomstring')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const k8s = require('k8s')
const ssh = require('ssh2').Client
const keypair = require('keypair')
const forge = require('node-forge')
const path_module = require('path');
const moduleHolder = {};

const cmdOptions = [
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

function loadModules(path) {
    fs.lstat(path, function(err, stat) {
        if (stat.isDirectory()) {
            // we have a directory: do a tree walk
            fs.readdir(path, function(err, files) {
                var f, l = files.length;
                for (var i = 0; i < l; i++) {
                    f = path_module.join('./', path, files[i]);
                    loadModules(f);
                }
            });
        } else {
			if(path_module.extname(path) != '.js') return
            // we have a file: load it
            require('./' + path)(moduleHolder);
        }
    });
}

function watchModules(path) {
	fs.watch(path, (event, who) => {
		if (event != 'change') return
		f = path + '/' + who
		loadModules(f)
	})
}

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
		  "id_rsa": encodeBase64(keys.ssh.private),
		  "id_rsa.pub": encodeBase64(keys.ssh.public)
	  }
	}
}

function createVolumeClaim(details) {
	return {
		"kind": "PersistentVolumeClaim",
		"apiVersion": "v1",
		"metadata": {
			"name": details.name,
			"namespace": details.namespace,
			"labels": {
				"app": details.cntName
			}
		},
		"spec": {
			"storageClassName": "rook-ceph-block",
			"accessModes": [ 
				'ReadWriteOnce'
			],
			"resources": {
				"requests": {
					"storage": details.size
				}
			}
		}
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

function createDeployment(details, volumes, containers, initContainers) {
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
					nodeSelector: {
						location: details.location,
					},
					hostname: details.name,
					volumes: volumes,
					containers: containers,
					initContainers: initContainers
				  }
				}
		}
	}
}

function createService(details) {
	//const name = (details.type == "webdav") ? details.name + '-ht' : details.name + '-jwt'
	return {
		kind: "Service",
		apiVersion: "v1",
		metadata: {
			name: details.name,
			namespace: details.namespace,
			labels: {
				app: details.iname,
				type: details.type
			}
		},
		spec: {
			selector: {
				app: details.iname
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
		User.find({email: decoded.user}, (err, results) => {
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

function deleteAndCreateSecret(namespace, data, name) {
		return new Promise((resolve, reject) => {
			const sName = name || 'keys'
			kubeapi.delete('namespaces/' + namespace + '/secrets/' + sName, (err) => {
				if (err) {
					if (!(err.reason == 'NotFound')) {
						console.log(err)
					}
				}
				kubeapi.post('namespaces/' + namespace + '/secrets', createSecret(data), (err, result) => {
					if (err) reject()
					resolve(result)
				})
			})
		})
}

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
			let keys = null
			if (results.length === 0) {
				const iuser = user.email.split('@')[0]
				// generate user keys
				keys = await generateKeys({
					email: user.email,
					user: iuser
				})
				console.log(keys)
				// create user mongo entry
				new User({
					email: user.email,
					namespace: user.namespace,
					keys: keys
				}).save()
			} else {
				keys = results[0].keys
			}

			// initialize k8s namespace for user
			kubeapi.post('namespaces', createNamespace(user.namespace), async (err, result) => {
				if (err) {
					if (!(err.reason == 'AlreadyExists')) {
						console.log(err)
					}
				}
				try{
					// create k8s secret with keys for user
					await deleteAndCreateSecret(user.namespace, keys, 'keys')
					res.status(200).send({
						"token": userToken,
						"user": user.email
					})
				} catch(err) {
					console.log(err)
					res.status(500).send()
				}
			})
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
	let doneCnt = 2
	function done(cb) {
		doneCnt -= 1
		if (doneCnt == 0) {
			cb()
		}
	}
	console.log("[SSH] connecting", adaptor)
	return new Promise((resolve, reject) => {
		const conn = new ssh()
		conn.on('error', (err) => {
			console.log("[SSH] ERRROR [" + adaptor.host + "]: "  + err)
			reject(err)
		})
		conn.on('ready', () => {
			console.log("[SSH] connected to: " + adaptor.host);
			conn.sftp((err, sftp) => {
				if (err) reject(err)
				sftp.appendFile('.ssh/authorized_keys', adaptor.keys.public + '\n', (err) => {
					if (err) reject(err)
					console.log("[SSH] added public key to: " + adaptor.host)
					done(resolve)
				})
				sftp.writeFile('.ssh/process_id_rsa', adaptor.keys.private + '\n', {mode: '0600'}, (err) => {
					if (err) reject(err)
					console.log("[SSH] added private key to: " + adaptor.host)
					done(resolve)
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
	info.push({
		type: 'token',
		header: 'x-access-token',
		value: req.user.keys.token
	})
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

const getNextPort = function() {
	let port = 9000
	return function() {
		return port++
	}
}()

app.post(api + '/infrastructure', checkToken, async(req, res) => {
	const infra = req.body
	let cntPort = 3001
	const response = {}
	const services = []
	const claims = []
	const adaptorDescriptions = []
	const volumes = createVolume()
	// convert description to k8s container list
	const sshPromises = infra.storageAdaptorContainers.filter(adaptor => {
		return adaptor.type == "sshfs"
	}).map(async(adaptor, index) => {
		adaptor.keys = req.user.keys.ssh
		// create ssh keys
		if(!(await checkSshConnection(adaptor))) {
			try {
				await copySshId(adaptor)
			}catch(err) {
				const e = {
					host: adaptor.host,
					name: adaptor.name,
					error: err
				}
				res.status(500).send(e)
				return
			}
		} else {
			console.log("[SSH] key already present: " + adaptor.host)
		}

		// create container descriptions
		cntPort += 1
		const u = moduleHolder['sshfs']({
			name: adaptor.name,
			namespace: req.user.namespace,
			containerPort: cntPort,
			sshHost: adaptor.host,
			sshPort: adaptor.port || '22',
			sshUser: adaptor.user,
			sshPath: adaptor.path
		})
		const desc = {
			name: adaptor.host,
			host: 'localhost',
			port: cntPort,
			type: 'webdav',
			mount: adaptor.path
		}
		adaptorDescriptions.push(desc)
		return u
	})

	const sshContainers = await Promise.all(sshPromises)

	async function processContainers(c, index) {
		if(!moduleHolder[c.type]) {
			console.log("[ERROR] " + c.type + " not found.")
			return
		}
		c.adaptors = sshContainers
		c.descriptions = adaptorDescriptions
		c.user = req.user
		c.env = c.env || {}
		c.containerPort = c.port ||  getNextPort()
		const u = moduleHolder[c.type](c)
		if(c.service) {
			const s = createService({
				name: infra.name + '-' + c.type,
				iname: infra.name,
				namespace: req.user.namespace,
				targetPort: c.service.targetPort || c.containerPort,
				type: c.type
			})
			services.push(s)
		}
		return u
	}

	// create logic containers
	const lgPromises = infra.logicContainers.map(processContainers)
	const lgContainers = await Promise.all(lgPromises)
	
	// create init containers
	const initPromises = infra.initContainers.map(processContainers)
	const initContainers = await Promise.all(initPromises)

	const containers = sshContainers.concat(lgContainers)

	// generate k8s YAML deployment
	const deployment = createDeployment({
		name: infra.name,
		namespace: req.user.namespace,
		location: infra.location
	}, volumes, containers, initContainers)

	let yml = ""
	services.forEach(s => {
		yml += YAML.stringify(s)
		yml += "---\n"
	})
	yml += YAML.stringify(deployment)
	console.log(yml)
	
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
		console.log("Error deploying: " + JSON.stringify(err))
	}


	res.status(200).send(YAML.parseAllDocuments(yml))
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

function generateKeys(user) {
	return new Promise((resolve, reject) => {
		const pair = keypair();
		const publicSshKey = forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(pair.public), user.user + '@process-eu.eu')
		const privateSshKey = forge.ssh.privateKeyToOpenSSH(forge.pki.privateKeyFromPem(pair.private), user.user + '@process-eu.eu')
		jwt.sign({
			email: user.email
		}, pair.private, {algorithm: 'RS256'}, (err, token) => {
			if (err) reject(err)
			resolve({
				ssh: {
					public: publicSshKey,
					private: pair.private
				},
				raw: pair,
				token: token
			})
		})
	})
}

// load container handlers
loadModules('./containers')
watchModules('./containers')

// generate debug token
const myToken = generateToken("r.s.cushing@uva.nl", "cushing-001")
console.log(myToken)

// start HTTPS server
//console.log("Starting secure server...")
//httpsServer.listen(options.port || 4243)

// start HTTP server
console.log("Starting server...")
httpServer.listen(options.port || 4200)
