from background import StagingMonitor
from flask import Flask, request
from GRID_LRT.Staging import stager_access as staging
from helpers import get_surls, json_respone
from json import dumps

app = Flask(__name__)

@app.route('/')
def index():
    return json_respone({}, 200)


@app.route('/observation/<int:sasid>/surls')
def get_observation_surls(sasid):
    surls = get_surls(sasid)

    return json_respone({'surls': surls}, 200)


@app.route('/stage', methods=['POST'])
def stage():
    payload = request.get_json()

    # Validate payload
    stype = payload['cmd']['type']
    if stype != 'lofar':
        return json_respone({'error': 'Provided type is not LOFAR.'}, 400)

    sid = payload['cmd']['src']['id']
    if not isinstance(sid, int) and not sid.isdigit():
        return json_respone({'error': 'Provided id is not integer.'}, 400)

    # Request staging
    surls = get_surls(int(sid))
    rid = staging.stage(surls)

    # Monitor staging
    monitor = StagingMonitor(rid)
    monitor.start()

    return json_respone({'requestId': rid}, 200)


@app.route('/requests')
def get_requests():
    progress = staging.get_progress()
    return json_respone(progress, 200)


@app.route('/request/<int:rid>/status')
def get_request_status(rid):
    status = staging.get_status(rid)
    return json_respone(status, 200)


@app.route('/request/<int:rid>/srm')
def get_request_srm(rid):
    srm = staging.get_srm_token(rid)
    return json_respone(srm, 200)


@app.route('/request/<int:rid>/surls')
def get_request_surls(rid):
    surls = staging.get_surls_online(rid)
    return json_respone(surls, 200)


if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True)