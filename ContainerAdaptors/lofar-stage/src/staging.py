###############################################################################
#
# PROCESS LOFAR staging service
#
#  Author:  Tim van Zalingen, University of Amsterdam
#  Date:    28 February 2019
#
###############################################################################

from datetime import datetime
import threading
import time
import stager_access_python3 as sa
from flask import Flask
from flask import request
import get_surl_list as surll
import requests

app = Flask(__name__)
@app.route('/stest')
def get_surl_list2():
    print ("TEST")
    surl = surll.get_surl_list(246403)
    return str(surl)

@app.route('/')
def default():
    help_text = '\
ENDPOINT        DESCRIPTION\n\
"/"             Help page\n\
"/stage"        Stage based on the SAS Id\n\
"/status"       Get the status of staging based on stage Id\n\
"/progress"     Get progress of all running stage requests\n\
'
    return help_text

""" This function is purely to test the LOFAR pipeline with Souley. The
 function is to call the webhook directly instead of the callback. """
def stage_webhook(req, stage_id, surl):
    hook = req['cmd']['webhook']
    method = hook['method']
    url = hook['url']
    headers = hook['headers']
    payload = {
        'stage_id': stage_id,
        'surl': surl
    }
    if (method == 'POST'):
        r = requests.post(url, headers=headers, json=payload)
    print(r.text)

# TODO Make a stage_callback function for integration with core-query (proxy)
# for Reggie's data services

""" This function polls the LTA from 10 seconds to an hour, increasing
 exponentially on each step, to find out whether the data is staged to dcache.
 When done, it returns true. """
def poll_stage(req, stage_id, surl):
#    f = open('output.txt', 'w')
    staged = False
    total_time = 0
    timer = 10
#    f.write('Staging {0}\n'.format(stage_id))
    print('Staging {0}\n'.format(stage_id))
    while (not staged):
        if (timer < 3600):
            timer = 2 * timer
        status = sa.get_status(stage_id)
#        f.write('Status {0} at {1} (next {2})\n'.format(status, total_time, timer))
        print('Status {0} at {1} (next {2})\n'.format(status, total_time, timer))
        if (staged):
            break
        time.sleep(timer)
        total_time = total_time + timer
        if (total_time > 172800):
            break;
            staged = True
    if (staged):
        print('Staging complete\n')
        return True
    else:
        print('Staging failed\n')
        return False
#    f.close()

""" POST /stage
 Takes a json lofar stage request as input.
 TODO
 At the moment it should stage, poll until staging is done.
 Afterwards call callback with the right SURLs.
 The core-query (proxy) will then handle the movement of staged data. """
@app.route('/stage', methods=['POST'])
def stage():
    #stage_id = None
    #SAS_id = request.args.get('id', type=int)
    #SAS_id = 246403
    req = request.get_json()
    SAS_id = req['cmd']['src']['id']
    if (req['cmd']['type'] == 'lofar'):
        print ('Request:  Stage SAS_id {0}\n'.format(SAS_id))
        if (SAS_id == None):
            return 'SAS Id not found\n';
        surl = surll.get_surl_list(int(SAS_id))
        print('Got SURL: {0}\n'.format(surl))
        #stage_id = sa.stage(surl)
        stage_id = 2247
        #    poll_thread = threading.Thread(target=poll_stage, kwargs={'req': req, stage_id': stage_id, 'surl': surl})
        #poll_thread.start()
        print('Testing callback mechanism')
        stage_webhook(req, stage_id, surl)
        return 'Searching for SAS Id {0}, got stage id {1}. Initiated staging polling thread\n'.format(SAS_id, stage_id)
    else:
        return False


@app.route('/status')
def status():
    stage_id = request.args.get('id', type=int)
    status = sa.get_status(stage_id)
    return status

@app.route('/progress')
def progress():
    progress = sa.get_progress()
    if (progress == None):
        return 'No pending staging at the moment\n'
    return '{0}\n'.format(sa.prettyprint(progress))

@app.route('/get_srm')
def get_srm():
    stage_id = request.args.get('id', type=int)
    srm = sa.get_srm_token(stage_id)
    print (srm)
    if (srm == None):
        return "No SRM details found\n"
    return srm

@app.route('/get_surls')
def get_staged_surls():
    stage_id = request.args.get('id', type=int)
    staged = sa.get_surls_online(stage_id)
    print (staged)
    return str(staged)

if __name__ == '__main__':
    app.run(debug=True,host='0.0.0.0',port=5000, threaded=True)
    #stage()
