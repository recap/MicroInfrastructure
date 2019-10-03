from json import dumps, loads
from os import environ
from threading import Thread

from flask import Flask, request
from pika import BlockingConnection, ConnectionParameters

from helpers import json_respone
from lofar import stage_entrypoint, status_entrypoint

### Config

amqp_host = environ['AMQP_HOST']
amqp_exchange = 'function_proxy'
amqp_routingkey = 'functions.lofar.*'

### Shared Entrypoints (Pika/Flask) 

functions = {
    'status': status_entrypoint,
    'stage': stage_entrypoint
}

### Pika

connection = BlockingConnection(ConnectionParameters(host=amqp_host))
channel = connection.channel()
channel.exchange_declare(amqp_exchange, 'topic')

result = channel.queue_declare(queue='', exclusive=True)
queue = result.method.queue
channel.queue_bind(queue, amqp_exchange, amqp_routingkey)

def callback(_ch, method, properties, message):
    print(f'Incoming AMQP message: {message}.')

    message = loads(message)
    function_name = method.routing_key.split('.')[-1]

    function = functions[function_name]
    result, status = function(message['body'])

    # Reply to sender over message queue
    reply = dumps({
        'id': message['id'],
        'status': status,
        'body': result,
    })
    channel.basic_publish(amqp_exchange, message['replyTo'], reply)

channel.basic_consume(queue, callback, auto_ack=True)

### Flask

app = Flask(__name__)

@app.route('/status', methods=['POST'])
def status():
    payload = request.get_json()
    result, status = functions.get('status')(payload)

    return json_respone(result, status)


@app.route('/stage', methods=['POST'])
def stage():
    payload = request.get_json()
    result, status = functions.get('stage')(payload)

    return json_respone(result, status)

### Main

if __name__ == '__main__':
    # Listen for AMQP messages in the background
    Thread(target=channel.start_consuming).start()

    app.run(host='0.0.0.0', threaded=True)
