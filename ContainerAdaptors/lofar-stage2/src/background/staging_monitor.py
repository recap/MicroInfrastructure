from threading import Thread
from time import sleep


class StagingMonitor(Thread):

    def __init__(self, rid):
        Thread.__init__(self)
        self.rid = rid        

    def poll(self):
        print(f"TODO: poll request {self.rid}")
        if self.counter > 5:
            self.finished = True
            return True
        
        return False

    def run(self):
        self.counter = 0
        self.finished = False

        while not self.finished:
            if not self.poll():
                sleep(1)

            self.counter = self.counter + 1
        
        print('Finished!')
