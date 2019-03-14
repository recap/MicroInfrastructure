"use strict";
const jwt = require('jsonwebtoken')

var jsDAV = require("jsDAV/lib/jsdav"),
    jsDAV_Auth_Backend_Token = require("jsDAV/lib/DAV/plugins/auth/token"),
    jsDAV_Locks_Backend_FS = require("jsDAV/lib/DAV/plugins/locks/fs");

//jsDAV.debugMode = true;

jsDAV.createServer({
    node: "/data",
    locksBackend: jsDAV_Locks_Backend_FS.new("/assets"),
    authBackend: jsDAV_Auth_Backend_Token.new("/assets/jwtusers"),
    realm: "jsdav"
}, 8001, '0.0.0.0');

