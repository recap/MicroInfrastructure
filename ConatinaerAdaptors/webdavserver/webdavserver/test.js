const http = require('http')
const fs = require('fs')
const xml = require('xml')

const config = require('./config.json')
const api = '/api/v1'
const fileDB = []


const x = xml({
	'd:response': [{ 'a:href': '/' }
	]})

console.log(x)
const s = fs.readFileSync('ff.xml', 'utf-8')

const server = http.createServer((req, res) => {
	const { method, url } = req;
	if (method == 'GET') {
		console.log('Redirect')
		res.write('ff')
		res.end()
	}
	if (method == 'PROPFIND') {
		const headers = computeCORSHeaders(req)
		headers['DAV'] = '1,3,extended-mkcol,2'
		headers['Allow'] = 'OPTIONS,GET,HEAD,DELETE,PROPFIND,PUT,PROPPATCH,COPY,MOVE,REPORT,LOCK,UNLOCK'
		res.writeHeader(207, headers)
		res.write(s)
		res.end()
	}
	if (method == 'OPTIONS') {
		const headers = computeCORSHeaders(req)
		headers['DAV'] = '1,3,extended-mkcol,2'
		headers['Allow'] = 'OPTIONS,GET,HEAD,DELETE,PROPFIND,PUT,PROPPATCH,COPY,MOVE,REPORT,LOCK,UNLOCK'
		console.log(headers)
		res.writeHeader(200, headers)
		res.end()
	}
	console.log(method)
	console.log(url)
}).listen(4343)


function computeCORSHeaders (req) {
        var allowedHeaders = accessControlAllowHeaders(req);
        var allowedOrigins = req.headers.origin || '*';

        var headers = {
            "Access-Control-Allow-Methods": 
                //  All verbs from HTTP
                "GET, HEAD, PUT, POST, DELETE, TRACE, OPTIONS, CONNECT, " +
                //  PATCH from RFC 5789
                "PATCH, " +
                //  All verbs from WebDAV core (RFC 4918)
                "PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, " +
                //  All verbs from DeltaV extensions to WebDAV core (RFC 3253)
                "VERSION-CONTROL, REPORT, CHECKOUT, CHECKIN, UNCHECKOUT, MKWORKSPACE, UPDATE, LABEL, MERGE, BASELINE-CONTROL, MKACTIVITY, " +
                //  Microsoft WebDAV extension
                "GETLIB",

            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Headers": allowedHeaders,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Origin": allowedOrigins,
        };

        return headers;
}


function accessControlAllowHeaders (req) {
        //  HTTP headers are case-insensitive...
        const reqHeaders = req.headers["Access-Control-Request-Headers"] ||
                         req.headers["access-control-request-headers"];
		const defaultAccessControlAllowHeaders = [
			"accept",
			"accept-charset",
			"accept-encoding",
			"accept-language",
			"authorization",
			"content-length",
			"content-type",
			"host",
			"origin",
			"proxy-connection",
			"referer",
			"user-agent",
			"x-requested-with"
		]

        if (reqHeaders) {
            // Just tell the client what it wants to hear
            return reqHeaders;
        }
        else {
            // or tell it everything we know about plus any x- headers it sends
            return Object.keys(req.headers).reduce(
                function(headers, header) {
                    if (header.indexOf("x-") === 0) {
                        headers += "," + header;
                    }
                    return headers;
                },
                defaultAccessControlAllowHeaders);
        }
}
