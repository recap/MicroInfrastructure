"use strict";
const config = require('./config.json')
const jwt = require('jsonwebtoken')

var jsDAV = require("jsDAV/lib/jsdav");
//jsDAV.debugMode = true;

Object.keys(config.Users).forEach((k) => {
	const v = config.Users[k];
	v.decodedPublicKey = Buffer.from(v.publicKey, 'base64').toString()
})


var authWithToken = (function(config) {
	var config = config;

	return function(ref, req, res, next) {

		function forbid(msg) {
			if (msg) {
				console.log(msg);
			}
			var headers = [];
			res.writeHead(403, headers);
			res.end();
		}

		if (!config.enforceTokenAuth) {
			next(null, ref);
			return;
		}
		if (!req.headers.authorization) {
			forbid('No authorization header')
			return;
		}

		var token = req.headers.authorization.replace('Bearer ','');
		if (!token) {
			forbid('No token');
			return;
		}
		var preDecoded = jwt.decode(token);
		if (!preDecoded) {
			forbid('Error decoding token');
			return;
		}
		var user = preDecoded.email;
		var cert = config.Users[user].decodedPublicKey
		if (!user || !config.Users || !config.Users[user] || !cert) {
			forbid('No user');
			return;
		}
		jwt.verify(token, cert, function(err, decoded) {
			if (err) {
				forbid(err);
				return;
			}
			next(null, ref)
		});
	}
})(config);


var jsDAV_Locks_Backend_FS = require("jsDAV/lib/DAV/plugins/locks/fs");

jsDAV.createServer({
    node: "/data",
    locksBackend: jsDAV_Locks_Backend_FS.new("/tmp"),
}, 8000, '0.0.0.0', authWithToken);
