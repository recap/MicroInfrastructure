from json import dumps

def json_respone(payload, status_code):
    if payload == None:
        payload = {}

    return (dumps(payload), status_code, {'Content-Type':'application/json'})
