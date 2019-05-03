FROM nikolaik/python-nodejs

# Add files
ADD . .

# Install dependencies (1)
RUN apt-get -qq update && apt-get -qq install -y \
    libaio1 \
&& rm -rf /var/lib/apt/lists/*

# Install dependencies (2)
RUN ./scripts/install-lofar-lta.sh

# Install dependencies (3)
RUN pipenv install --skip-lock



