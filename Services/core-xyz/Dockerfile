FROM nikolaik/python-nodejs

# Add files
ADD . .

# Install dependencies (1)
RUN pipenv install --system --skip-lock

# Logging configuration
ENV LOGURU_FORMAT="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>"

EXPOSE 5000
ENTRYPOINT [ "scripts/entrypoint.sh" ]
