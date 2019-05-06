from GRID_LRT.Staging import stager_access as staging
from helpers import execute_webhook
from threading import Thread
from time import sleep


class StagingMonitor(Thread):

    def __init__(self, rid, interval, webhook=None):
        Thread.__init__(self)
        self.rid = rid
        self.interval = interval
        self.webhook = webhook

    def is_finished(self):
        status = staging.get_status(self.rid)
        print(f'Current status of staging request #{self.rid}: {status}.')

        return status == 'success'

    def run(self):
        counter = 0
        finished = False

        print(f'Monitoring staging request #{self.rid} every {self.interval}s.')

        while not finished:
            sleep(self.interval)

            finished = self.is_finished()
            counter = counter + 1

        if self.webhook is not None:
            execute_webhook(self.webhook)


