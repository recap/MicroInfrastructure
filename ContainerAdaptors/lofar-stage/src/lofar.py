from background import StagingMonitor
from helpers import get_ltaproxy, get_surls, json_respone


def status_entrypoint(payload):
    command = payload['cmd']

    # Extract payload
    request_id = command['requestId']
    username = command['credentials']['lofarUsername']
    password = command['credentials']['lofarPassword']

    # Get status
    result = get_staging_status(username, password, request_id)
    return (result, 200)


def get_staging_status(username, password, request_id):
    lta_proxy = get_ltaproxy(username, password)
    progresses = lta_proxy.LtaStager.getprogress()

    if progresses is None:
        return {}

    progress = progresses.get(request_id)
    if progress is None:
        return {}

    return {request_id: progress}


def stage_entrypoint(payload):
    command = payload['cmd']
    webhook = payload.get('webhook', None)

    # Extract payload
    username = command['credentials']['lofarUsername']
    password = command['credentials']['lofarPassword']
    target_id = command['src'].get('id')
    target_paths = command['src'].get('paths')

    target = target_id if target_id is not None else target_paths

    # Request staging 
    result = new_staging_request(username, password, target, webhook)
    return (result, 200)


def new_staging_request(username, password, target, webhook):
    try:
        if (type(target) is int or target.isdigit()):
            surls = get_surls(int(target), username, password)
        elif type(target) is list:
            surls = target
    except:
        message = 'Could not find data products: credentials not valid? unsupported observation type?'
        return {'message': message}

    lta_proxy = get_ltaproxy(username, password)
    request_id = lta_proxy.LtaStager.add_getid(surls)

    # Monitor staging, when a webhook is provided
    if webhook is not None:
        webhook['payload'] = {
            'requestId': request_id,
            'surls': surls
        }

        monitor = StagingMonitor(request_id, 30, lta_proxy, webhook)
        monitor.start()

    return {'requestId': request_id}
