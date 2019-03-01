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



def poll_stage(stage_id, surl):
    f = open('output.txt', 'w')
    staged = False
    total_time = 0
    timer = 10
    f.write('Staging {0}\n'.format(stage_id))
    print('Staging {0}\n'.format(stage_id))
    while (not staged):
        if (timer < 3600):
            timer = 2 * timer
        status = sa.get_status(stage_id)
        f.write('Status {0} at {1} (next {2})\n'.format(status, total_time, timer))
        print('Status {0} at {1} (next {2})\n'.format(status, total_time, timer))
        if (staged):
            break
        time.sleep(timer)
        total_time = total_time + timer
        if (total_time > 100):
            staged = True
    print('Staging complete\n')
    f.close()

@app.route('/stage')
def stage():
    stage_id = None
    SAS_id = request.args.get('id', type=int)
    #SAS_id = 246403
    print ('Request:  Stage SAS_id {0}\n'.format(SAS_id));
    if (SAS_id == None):
        return 'SAS Id not found\n';
    surl = surll.get_surl_list(int(SAS_id))
    print('Got SURL: {0}\n'.format(surl))
    #stage_id = sa.stage(surl)
    #stage_id = 2247
    #poll_thread = threading.Thread(target=poll_stage, kwargs={'stage_id': stage_id, 'surl': surl})
    #poll_thread.start()
    #poll_stage(stage_id, surl)
    return 'Searching for SAS Id {0}, got stage id {1}\n'.format(SAS_id, stage_id);

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
