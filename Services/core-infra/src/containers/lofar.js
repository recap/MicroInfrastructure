const name = 'lofar'

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
	let cmd = "sleep 10 && /scripts/entrypoint.sh"
	const appConfig = encodeBase64(JSON.stringify(details.descriptions))
	return {
				"name": details.name,
				"image": "recap/adaptor-lofarstage:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 4300
					}
				],
				"env": [
					{ "name": "AMQP_HOST", "value": "127.0.0.1"},
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

