const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const jsDav = require('jsDAV/lib/DAV/server')
const jsDavLock = require('jsDAV/lib/DAV/plugins/locks/fs')

const config = require('./config.json')
const app = express()
const api = '/api/v1'
const fileDB = []

const src = process.argv[2] || '/data/'
const dest = process.argv[3] || '/shared-data/'
const port = process.argv[4] || config.port || 8080

function dig (sourceDir, destinationDir) {
  fs.readdir(sourceDir, (err, files) => {
    if (err) {
      return
    }
    files.forEach(f => {
      fs.lstat(sourceDir + f, (err, stat) => {
        if (err) {
          console.log(err)
          return
        }
        if (stat.isDirectory()) {
          fs.mkdir(destinationDir + f, (err) => {
            if (err) {}
          })
          dig(sourceDir + f + '/', destinationDir + f + '/')
        } else if (stat.isFile()) {
          console.log("Linking: " + sourceDir + f)
          fs.writeFile(destinationDir + f, new Date().toISOString(), (err) => {
            if (err) {
              console.log(err)
              return
            }
            fileDB.push(sourceDir + f)
          })
        }
      })
    })
  })
}

jsDav.createServer({
	node: src,
	locksBackend: jsDavLock.new('/tmp')
}, port, '0.0.0.0')

/*console.log('Updating file list.')
dig(src, dest)

app.use(bodyParser.json())

app.get(api + '/files/', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).send(JSON.stringify(fileDB))
})

console.log('Starting service on port: ' + port)
app.listen(port)*/
