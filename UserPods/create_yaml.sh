#!/bin/bash
ID=$(shuf -i 2000-65000 -n 1)
sed -e s/##SSH_USER_A##/$2/g $1 | sed -e s/##SSH_HOST_A##/$3/g | sed -e s/##ID##/$ID/g | sed -e s/##SSH_USER_B##/$4/g | sed -e s/##SSH_HOST_B##/$5/g
