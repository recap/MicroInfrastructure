const name = 'scp'
function handler(details) {
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


module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

