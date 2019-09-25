const name = 'redis'

function handler(details) {
	return {
			"name": "redis",
			"image": "redis",
			"imagePullPolicy": "Always",
			"ports": [
				{
					"containerPort": details.containerPort || 6379
				}
			],
			"env": [
				{ "name": "NAME", "value": details.name }

			],
			"command": [ "redis-server" ],
		}
}

module.exports = function(moduleHolder) {
	moduleHolder[name] = handler
	console.log("Loaded container module: " + name)
}


