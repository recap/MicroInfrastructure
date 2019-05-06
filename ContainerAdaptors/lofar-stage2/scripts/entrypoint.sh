#!/bin/bash

# Update LOFAR credentials at runtime
sed -i "s/\(database_user *: *\).*/\1$LOFAR_USER/" "$HOME/.awe/Environment.cfg"
sed -i "s/\(database_password *: *\).*/\1$LOFAR_PASS/" "$HOME/.awe/Environment.cfg"

exec python "./src/app.py"