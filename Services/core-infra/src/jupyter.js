const crypto = require('crypto')
const shasum = crypto.createHash('sha1')

exports.jupyterPasswd = function(password) {
	const saltLen = 12
	const max = Math.pow(2, 4 * saltLen)
	const salt  = Math.floor(Math.random() * Math.floor(max)).toString(16)
	shasum.update(password + salt)
	const hash = shasum.digest('hex')
	return 'sha1:' + salt + ':' +  hash
}






