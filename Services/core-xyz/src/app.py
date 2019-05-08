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
    identifier = payload['id']
    command = payload['cmd']
    webhook = payload['webhook']

    # determine appropriate container to run
    if command['type'] == 'stage' and command['subtype'] == 'lofar':
        container = LofarStage(identifier, command, webhook)
    if command['type'] == 'copy' and command['subtype'] == 'srm2hpc':
        #container = Srm2Hpc(identifier, command, webhook)
        pass

    response = container.run()

    # TODO: have some state record-keeping

    # forward bootstrap response
    return json_respone(load(response.text), 200)

@app.route('/callback', methods=['POST'])
def callback():
    payload = request.get_json()
    print(dumps(payload, indent=4))

    # TODO: kill corresponding docker container

    # TODO: forward response

    # TODO: delete from 'state' record-keeping

    return json_respone({}, 200)

if __name__ == '__main__':
    app.run(host='0.0.0.0', threaded=True)
