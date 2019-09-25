const name = 'query'

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
	let cmd = "echo $JWTUSERS | base64 -d > /assets/jwtusers.json && echo $PUBLICKEY > /tmp/publicKey.txt && cd /app/ && node app.js --config $APPCONFIG -c /tmp/publicKey.txt -p 8002 -u /assets/jwtusers.json"
	const appConfig = encodeBase64(JSON.stringify(details.descriptions))
	return {
				"name": details.name,
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

