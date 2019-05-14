from base64 import b64encode
from json import dumps
from zlib import compress

def base64_str(s):
    return b64encode(compress(s.encode('UTF-8'))).decode('UTF-8')

def base64_dict(d):
    return b64encode(dumps(d).encode('UTF-8')).decode('UTF-8')