const name = 'sshfs'
function handler(details) {
	return {
				"name": details.name,
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

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}

