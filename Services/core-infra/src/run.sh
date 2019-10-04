#!/bin/bash
node app.js -m 172.17.0.2  -k ../privatekey.txt -c ../publickey.txt -s ../anotherkey.crt --dbpass core-infra -p 4300
