FROM nikolaik/python-nodejs

# Install dependencies
RUN pipenv install --system --skip-lock

# Add files
ADD src/ src/

EXPOSE 5000
ENTRYPOINT [ "python", "src/app.py" ]
