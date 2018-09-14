#!/bin/bash
sed -e s/##SSH_USER##/$2/g $1 | sed -e s/##SSH_HOST##/$3/g
