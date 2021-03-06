from helpers import execute_webhook
from loguru import logger
from threading import Thread
from time import sleep


class StagingMonitor(Thread):

    def __init__(self, rid, interval, lta_proxy, webhook=None):
        Thread.__init__(self)
        self.rid = rid
        self.interval = interval
        self.lta_proxy = lta_proxy
        self.webhook = webhook

    def is_finished(self):
        status = self.lta_proxy.LtaStager.getstatus(self.rid)
        logger.info('Current status of staging request #{}: {}.', self.rid, status)

        return status == 'success'

    def run(self):
        counter = 0
        finished = False

        logger.info('Monitoring staging request #{} every {}s.', self.rid, self.interval)

        while not finished:
            sleep(self.interval)

            finished = self.is_finished()
            counter = counter + 1

        if self.webhook is not None:
            execute_webhook(self.webhook)
