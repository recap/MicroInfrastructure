from background import StagingMonitor
from flask import Flask, request
from helpers import get_ltaproxy, get_surls, json_respone
from json import dumps

app = Flask(__name__)

@app.route('/')
def index():
    return json_respone({}, 200)

@app.route('/status', methods=['POST'])
def status():
    payload = request.get_json()
    command = payload['cmd']

    # Validate payload
    sid = command['requestId']

    # Extract credentials
    lofar_username = command['credentials']['lofarUsername']
    lofar_password = command['credentials']['lofarPassword']

    lta_proxy = get_ltaproxy(lofar_username, lofar_password)

    # Get progress
    progress = lta_proxy.LtaStager.getprogress()
    if progress is None:
        return json_respone({}, 200)

    srequest = progress.get(str(sid))
    if request is None:
        return json_respone({}, 200)

    return json_respone({str(sid): srequest}, 200)


@app.route('/stage', methods=['POST'])
def stage():
    payload = request.get_json()
    identifier = payload['id']
    command = payload['cmd']
    
    # Validate payload
    stype = command['subtype']
    if stype != 'lofar':
        return json_respone({'error': 'Provided subtype is not LOFAR.'}, 400)

    # Extract credentials
    lofar_username = command['credentials']['lofarUsername']
    lofar_password = command['credentials']['lofarPassword']

    # Request staging
    try:
        src = command['src']
        sid = src.get('id')
        paths = src.get('paths')

        if sid is not None and (type(sid) is int or sid.isdigit()):
            surls = get_surls(int(sid), lofar_username, lofar_password)
        elif paths is not None and type(paths) is list:
            surls = paths
        else:
            return json_respone({'error': 'Could not determine source files (surls)'}, 400)

        lta_proxy = get_ltaproxy(lofar_username, lofar_password)
        rid = lta_proxy.LtaStager.add_getid(surls)
    except:
        message = 'Could not find data products: credentials not valid? unsupported observation type?'
        return json_respone({'id': identifier, 'message': message}, 400)
    
    # Prepare webhook/callback
    webhook = payload.get('webhook', None)
    if webhook is not None:
        webhook['payload'] = {
            'id': identifier,
            'requestId': rid,
            'surls': surls
        }

    # Monitor staging
    monitor = StagingMonitor(rid, 30, lta_proxy, webhook)
    monitor.start()

    return json_respone({'id': identifier, 'requestId': rid}, 200)

if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True)