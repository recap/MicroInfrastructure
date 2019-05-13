from flask import Flask, request
from containers import LofarStage, Srm2Hpc
from helpers import json_respone
from json import dumps, load

app = Flask(__name__)

@app.route('/')
def index():
    return json_respone({}, 200)

@app.route('/execute', methods=['POST'])
def execute():
    payload = request.get_json()

    # Extract payload
    identifier = payload['id']
    command = payload['cmd']
    webhook = payload['webhook']

    # Determine appropriate container to run
    if command['type'] == 'stage' and command['subtype'] == 'lofar':
        container = LofarStage(identifier, command, webhook)
    if command['type'] == 'copy' and command['subtype'] == 'srm2hpc':
        container = Srm2Hpc(identifier, command, webhook)

    # Run container
    response = container.run()

    return json_respone({ 'identifier': identifier }, 202)

if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True)
