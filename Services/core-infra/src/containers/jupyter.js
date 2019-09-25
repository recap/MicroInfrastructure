const crypto = require('crypto')
const name = 'jupyter'

function jupyterPasswd(password) {
	const shasum = crypto.createHash('sha1')
	const saltLen = 12
	const max = Math.pow(2, 4 * saltLen)
	const salt  = Math.floor(Math.random() * Math.floor(max)).toString(16)
	shasum.update(password + salt)
	const hash = shasum.digest('hex')
	return 'sha1:' + salt + ':' +  hash
}


function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}
function decodeBase64(sd) {
	return new Buffer(d, 'base64').toString()
}

function handler(details) {
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))
	const passwd = jupyterPasswd(details.pass)
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

