"use strict";
const jwt = require('jsonwebtoken')

var jsDAV = require("jsDAV/lib/jsdav"),
    jsDAV_Auth_Backend_File = require("jsDAV/lib/DAV/plugins/auth/file"),
    jsDAV_Locks_Backend_FS = require("jsDAV/lib/DAV/plugins/locks/fs");

//jsDAV.debugMode = true;

jsDAV.createServer({
    node: "/data",
    locksBackend: jsDAV_Locks_Backend_FS.new("/assets"),
    authBackend: jsDAV_Auth_Backend_File.new("/assets/htusers"),
    realm: "jsdav"
}, 8000, '0.0.0.0');

