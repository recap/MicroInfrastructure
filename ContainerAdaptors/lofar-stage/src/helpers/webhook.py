from loguru import logger
from requests import get, post

def execute_webhook(webhook):
    method = webhook['method'].upper()

    if method not in ['GET', 'POST']:
        throw(f'Method {method} not supported, must be GET/POST.')

    if method == 'GET':
        response = get(
            url=webhook['url'],
            headers=webhook['headers']
        )

    if method == 'POST':
        response = post(
            url=webhook['url'], 
            headers=webhook['headers'],
            json=webhook['payload']
        )

    logger.info('Executed webhook with url: {}.', webhook['url'])