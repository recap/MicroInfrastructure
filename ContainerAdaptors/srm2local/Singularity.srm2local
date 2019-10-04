BootStrap: docker
From: ubuntu:16.04

%post
    apt-get update && apt-get install -y \
        curl \
        openjdk-8-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

    cd /var/local

    curl -L "https://www.astron.nl/lofarwiki/lib/exe/fetch.php?media=public:lofar_grid_clients.tar.gz" | tar xz

    bash -c "source lofar_grid/init.sh && source lofar_grid/update_certificates_eugridpma.sh"

%runscript
    export X509_USER_PROXY=$HOME/.proxy

    DIR="/var/local/lofar_grid"

    export SRM_PATH=$DIR/srmclient-2.6.28/usr/share/srm
    export X509_CERT_DIR=$DIR/voms-clients/etc/certificates
    export PATH=$DIR/srmclient-2.6.28/usr/bin:$DIR/voms-clients/bin:$PATH
    export GLOBUS_GSSAPI_FORCE_TLS=1

    # Perform copying (+ stopwatch)
    echo "Starting: $(date)"
    srmcp -server_mode=passive -copyjobfile=$HOME/copyjobfile
    echo "Finished: $(date)"