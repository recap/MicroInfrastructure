const name = 'proxy'

function encodeBase64(s) {
	return new Buffer(s).toString('base64')
}

function handler(details) {
	const user = {
		[[details.user.email]]: {
			'publicKey': encodeBase64(details.user.keys.raw.public)
		}
	}
	const users = encodeBase64(JSON.stringify(user))
	let cmd = "sleep 10 && node app.js --amqp 127.0.0.1 -p 8003"
	const appConfig = encodeBase64(JSON.stringify(details.descriptions))
	return {
				"name": details.name,
				"image": "recap/process-core-proxy:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 4300
					}
				],
				"env": [
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

