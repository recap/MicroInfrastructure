const md5 = require('md5')
const name = 'webdav'
function handler(details) {	
	let cmd = ""
	const htpass = details.user + ":jsdav:" + md5(details.user + ":jsdav:" + details.pass)
	if(!details.adaptors) details.adaptors = []
	details.adaptors.map(a => {
		const host = a.env.filter(e => {
			return e.name == "NAME"
		})
		return {
			host: host[0].value,
			port: a.ports[0].containerPort
		}
	}).forEach(a => {
		cmd += " echo $HTDIGEST > /assets/htusers && /bin/mkdir -p /data/" + a.host + " && echo \'http://localhost:" + a.port + " u p\' >> /etc/davfs2/secrets && mount -t davfs http://localhost:" + a.port + " /data/" + a.host + " && " 
	})

	cmd += " cd /root/webdavserver && node webdavserver-ht.js"
	return {
				"name": details.name,
				"image": "recap/process-webdav:v0.3",
				"imagePullPolicy": "Always",
				"ports": [
					{
						"containerPort": 8000
					}
				],
				"env": [
					{ "name": "HTDIGEST", "value": htpass }
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

