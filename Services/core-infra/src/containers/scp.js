const name = 'scp'
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
	let cmd = "echo $JWTUSERS | base64 -d > /assets/jwtusers.json"
	cmd += " &&  /bin/cat /ssh/id_rsa > /root/.ssh/id_rsa && /bin/cat /ssh/id_rsa.pub > /root/.ssh/id_rsa.pub  && /bin/chmod 600 /root/.ssh/id_rsa && cd /root/app && node app.js --sshPrivateKey /root/.ssh/id_rsa -u /assets/jwtusers.json -p " + details.containerPort + " "

	return {
				"name": details.name,
				"image": "recap/process-scp2scp:v0.1",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": details.containerPort
					}
				],
				"env": [
					{ "name": "NAME", "value": details.name },
					{ "name": "JWTUSERS", "value": users }

				],
				"volumeMounts": [
					{ "name": "ssh-key", "mountPath": "/ssh", "readOnly": true },
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

