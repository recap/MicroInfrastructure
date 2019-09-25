const name = 'nextcloud'

function encodeBase64(s) {
	return new Buffer(s).toSting('base64')
}

function handler(details) {
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
				"name": details.name,
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

