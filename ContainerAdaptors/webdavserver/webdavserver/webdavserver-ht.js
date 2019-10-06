"use strict";
const jwt = require('jsonwebtoken')
const cmdArgs = require('command-line-args')

const cmdOptions = [
	{ name: 'port', alias: 'p', type: Number}
]
const options = cmdArgs(cmdOptions)
const port = options.port || 8000

var jsDAV = require("jsDAV/lib/jsdav"),
    jsDAV_Auth_Backend_File = require("jsDAV/lib/DAV/plugins/auth/file"),
    jsDAV_Locks_Backend_FS = require("jsDAV/lib/DAV/plugins/locks/fs");

//jsDAV.debugMode = true;

jsDAV.createServer({
    node: "/data",
    locksBackend: jsDAV_Locks_Backend_FS.new("/assets"),
    authBackend: jsDAV_Auth_Backend_File.new("/assets/htusers"),
    realm: "jsdav"
}, port, '0.0.0.0');

