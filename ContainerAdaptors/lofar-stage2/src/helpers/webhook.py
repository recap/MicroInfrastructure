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

    print(f'Executed webhook.')