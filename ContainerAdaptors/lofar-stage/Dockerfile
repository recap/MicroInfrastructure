FROM nikolaik/python-nodejs

# Install LOFAR software
ADD scripts/ scripts/
RUN ./scripts/install-lofar-lta.sh

# Install dependencies
ADD Pipfile Pipfile
RUN pipenv install --system --skip-lock

# Add files
ADD src/ src/

EXPOSE 5000
ENTRYPOINT [ "python", "src/app.py" ]
