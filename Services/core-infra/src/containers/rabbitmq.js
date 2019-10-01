const name = 'rabbitmq'

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
	let cmd = "rabbitmq-server"
	const appConfig = encodeBase64(JSON.stringify(details.descriptions))
	return {
				"name": details.name,
				"image": "rabbitmq:3",
				"imagePullPolicy": "Always",
				"command": ["/bin/sh", "-c" ],
				"args": [cmd]
			}
}

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

