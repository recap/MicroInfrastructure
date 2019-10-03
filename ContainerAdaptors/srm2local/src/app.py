from containers import Srm2Local
from flask import Flask, request
from helpers import json_respone

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
    if command['type'] == 'copy' and command['subtype'] == 'srm2local':
        container = Srm2Local(identifier, command, webhook)
    else:
        return json_respone({'message': 'Unsupported type/subtype'}, 400)

    # Run container
    response = container.run()

    return json_respone({
        'identifier': identifier,
        'response': response 
    }, 202)

if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True)
