const YAML = require('yaml')
const amqp = require('amqplib')
const cmdArgs = require('command-line-args')
const express = require('express')
const crypto = require('crypto')
const app = express()
const http = require('http')
const https = require('https')
const bodyParser = require('body-parser')
//const io = require('socket.io')(server)
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
const path_module = require('path');
const eventEmitter = new events.EventEmitter()
const moduleHolder = {};

const cmdOptions = [
	{ name: 'amqp', alias: 'q', type: String},
	{ name: 'mongo', alias: 'm', type: String},
	{ name: 'privateKey', alias: 'k', type: String},
	{ name: 'publicKey', alias: 'c', type: String},
	{ name: 'cert', alias: 's', type: String},
	{ name: 'port', alias: 'p', type: Number},
	{ name: 'dbpass', type: String},
	{ name: 'host', alias: 'h', type: String}
]

const options = cmdArgs(cmdOptions)
// TODO fix rook ceph storage
const disableRook = true

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

async function createUIJWTContainer(details) { 
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))

	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " echo $JWTUSERS | base64 -d > /assets/jwtusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})

	cmd += " cd /root/webdavserver && node webdavserver-jwt.js"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-webdav:v0.3",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 8001
					}
				],
				"env": [
					{ "name": "JWTUSERS", "value": users }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createDispelContainer(details) {
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))

	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " echo $JWTUSERS | base64 -d > /assets/jwtusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})
	cmd += " catalina.sh run"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-dispel:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 8080
					}
				],
				"env": [
					{ "name": "JWTUSERS", "value": users }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createNextcloudContainer(details) {
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))

	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " echo $JWTUSERS | base64 -d > /assets/jwtusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})
	cmd += " /entrypoint.sh apache2-foreground "
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-nextcloud:latest",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 80
					}
				],
				"env": [
					{ "name": "JWTUSERS", "value": users }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createJupyterContainer(details) {
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))
	const passwd = jupyter.jupyterPasswd(details.pass)
	const passwdString = encodeBase64("c.NotebookApp.password = u'" + passwd +"'")

	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " echo $JWTUSERS | base64 -d > /assets/jwtusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})
	cmd += " echo $JPASSWD | base64 -d >> /home/jovyan/.jupyter/jupyter_notebook_config.py && "
	cmd += " cd /data && jupyter lab --allow-root"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-jupyter:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 8888
					}
				],
				"env": [
					{ "name": "JWTUSERS", "value": users },
					{ "name": "JPASSWD", "value": passwdString }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createQueryContainer(details) {

	//console.log(details.users)
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))
	let cmd = "echo $JWTUSERS | base64 -d > /assets/jwtusers.json && echo $PUBLICKEY > /tmp/publicKey.txt && cd /app/ && node app.js --config $APPCONFIG -c /tmp/publicKey.txt -p 8002 -u /assets/jwtusers.json"
	const appConfig = encodeBase64(JSON.stringify(details.descriptions))
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-core-query:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 4300
					}
				],
				"env": [
					{ "name": "APPCONFIG", "value": appConfig },
					{ "name": "PUBLICKEY", "value": details.publicKey},
					{ "name": "JWTUSERS", "value": users }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
				],
				"command": ["/bin/sh", "-c" ],
				"args": [cmd]
			}
}

async function createGenericContainer(details) {

	let cmd = ""
	//console.log(details.users)
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})
	
	const users = encodeBase64(JSON.stringify(user))
	cmd += " " 
	cmd += details.cmd
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": details.image,
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": details.port
					}
				],
				"env": [
					{ "name": "PUBLICKEY", "value": details.publicKey},
					{ "name": "JWTUSERS", "value": users }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createDatanetContainer(details) {

	let cmd = ""
	//console.log(details.users)
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		if (isEmpty(host)) return []
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		if (isEmpty(a)) return	
		cmd += " /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})
	
	const users = encodeBase64(JSON.stringify(user))
	cmd += "  cd /scripts && ./run.sh "
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-datanet:v0.1",
				"imagePullPolicy": "Always",
				"env": [
					{ "name" : "AUTH", "value": details.auth }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

async function createUIContainer(details) { 
	let cmd = ""
	const htpass = details.user + ":jsdav:" + md5(details.user + ":jsdav:" + details.pass)
	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		cmd += " echo $HTDIGEST > /assets/htusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})

	cmd += " cd /root/webdavserver && node webdavserver-ht.js"
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-webdav:v0.3",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 8000
					}
				],
				"env": [
					{ "name": "HTDIGEST", "value": htpass }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" }
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

function createNativeStorageContainer(details) {

	const container =  {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-sshfs:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": details.containerPort
					}
				],
				"env": [
					{ "name": "STORAGE_NAME", "value": details.name },
					{ "name": "NAME", "value": details.name }
				],
				"volumeMounts": [
					{ "name": "shared-data", "mountPath": "/shared-data" },
					{ "name": details.volumeClaim.name, "mountPath": "/data" }
				],
				"command": ["/bin/sh", "-c" ],
				"args": [ "/bin/mkdir -p /shared-data/$STORAGE_NAME && cd /root/fileagent && node fileagent /data/ /shared-data/ " + details.containerPort ]
	}

	// TODO fic rook and remove
	if (disableRook) {
		container.volumeMounts.splice(-1,1)
	}

	return container
}

function createSshStorageContainer(details) {
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-sshfs:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": details.containerPort
					}
				],
				"env": [
					{ "name": "SSH_USER", "value": details.sshUser },
					{ "name": "SSH_HOST", "value": details.sshHost },
					{ "name": "SSH_PORT", "value": details.sshPort },
					{ "name": "SSH_PATH", "value": details.sshPath },
					{ "name": "NAME", "value": details.name }

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
				"args": [ "/bin/cat /ssh/id_rsa > /root/.ssh/id_rsa && /bin/cat /ssh/id_rsa.pub > /root/.ssh/id_rsa.pub  && /bin/chmod 600 /root/.ssh/id_rsa && ssh  -o StrictHostKeyChecking=no $SSH_USER@$SSH_HOST ls && sshfs $SSH_USER@$SSH_HOST:$SSH_PATH /data && /bin/mkdir -p /shared-data/$SSH_HOST && cd /root/fileagent && node fileagent /data/ /shared-data/$SSH_HOST/ " + details.containerPort ]
			}
}

function createScpContainer(details) {
	return {
				"name": dockerNames.getRandomName().replace('_','-'),
				"image": "recap/process-scp2scp:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": details.containerPort
					}
				],
				"env": [
					{ "name": "NAME", "value": details.name }

				],
				"volumeMounts": [
					{ "name": "ssh-key", "mountPath": "/ssh", "readOnly": true },
					{ "name": "shared-data", "mountPath": "/shared-data" }
				],
				"command": ["/bin/sh", "-c" ],
				"args": [ "/bin/cat /ssh/id_rsa > /root/.ssh/id_rsa && /bin/cat /ssh/id_rsa.pub > /root/.ssh/id_rsa.pub  && /bin/chmod 600 /root/.ssh/id_rsa && cd /root/app && node app.js --adaptorId scp:" + details.name +" --sshPrivateKey /root/.ssh/id_rsa -p " + details.containerPort + " "]
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
			await copySshId(adaptor)
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

	// create logic containers
	const lgPromises = infra.logicContainers.map(async(c, index) => {
		if(!moduleHolder[c.type]) {
			console.log("[ERROR] " + c.type + " not found.")
			return
		}
		c.adaptors = sshContainers
		c.descriptions = adaptorDescriptions
		c.user = req.user
		c.containerPort = c.port ||  getNextPort()
		const u = moduleHolder[c.type](c)
		if(c.service) {
			const s = createService({
				name: infra.name + '-' + c.type,
				iname: infra.name,
				namespace: req.user.namespace,
				targetPort: c.service.targetPort,
				type: c.type
			})
			services.push(s)
		}
		return u
	})
	const lgContainers = await Promise.all(lgPromises)
	
	// create init containers
	const initPromises = infra.initContainers.map(async(c, index) => {
		if(!moduleHolder[c.type]) {
			console.log("[ERROR] " + c.type + " not found.")
			return
		}
		c.adaptors = sshContainers
		c.descriptions = adaptorDescriptions
		c.user = req.user
		c.containerPort = c.port ||  getNextPort()
		const u = moduleHolder[c.type](c)
		if(c.service) {
			const s = createService({
				name: infra.name + '-' + c.type,
				iname: infra.name,
				namespace: req.user.namespace,
				targetPort: c.service.targetPort,
				type: c.type
			})
			services.push(s)
		}
		return u
	})
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

/*io.on('connection', function(client) {
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
})*/

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

//startMq()
//checkMongo()
//const myToken = generateToken("admin")
loadModules('./containers')
watchModules('./containers')
const myToken = generateToken("r.s.cushing@uva.nl", "cushing-001")
console.log(myToken)
//console.log("Starting secure server...")
//httpsServer.listen(options.port || 4243)
console.log("Starting server...")
httpServer.listen(options.port || 4200)
