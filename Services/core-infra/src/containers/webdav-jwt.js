const name = 'webdav-jwt'

function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function handler(details) {
	let cmd = ""
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))
	if(!details.adaptors) details.adaptors = []
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
				"name": details.name,
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

