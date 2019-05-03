#!/bin/sh

LIBRARY="lofar_lta-2.7.1"

# Download and extract
curl http://www.astro-wise.org/losoft/$LIBRARY.tar.gz | tar xz && cd $LIBRARY

# Run installers
python3 setup.py --quiet install
python3 setup.py --quiet install_oracle

# Configuration
if [ -d "/usr/local/lib/instantclient_11_2" ] ; then
    sh -c "echo /usr/local/lib/instantclient_11_2 > /etc/ld.so.conf.d/oracle-instantclient.conf"
fi
if [ -d "/usr/lib/instantclient_11_2" ] ; then
    sh -c "echo /usr/lib/instantclient_11_2 > /etc/ld.so.conf.d/oracle-instantclient.conf"
fi

ldconfig

exit 0
