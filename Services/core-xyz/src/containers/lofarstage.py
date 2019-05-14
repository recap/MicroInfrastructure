from docker import DockerClient
from json import loads
from requests import post
from time import sleep
from socket import gethostname


class LofarStage():
    
    def __init__(self, identifier, command, webhook):
        self.identifier = identifier
        self.command = command
        self.webhook = webhook
    
    def run(self):
        client = DockerClient(base_url='unix://var/run/docker.sock')
        source = self.command['src']
        credentials = self.command['credentials']

        # Start 'lofar-stage2' container
        container = client.containers.run(
            image='lofar-stage2',
            auto_remove=True,
            detach=True,
            tty=True,
            network='lofar-net',
            environment={
                'LOFAR_USER': credentials['lofarUsername'],
                'LOFAR_PASS': credentials['lofarPassword']
            }
        )

        # Reload container information
        sleep(1)
        container.reload()

        # bootstrap
        hostname = container.attrs['Config']['Hostname']
        response = post(
            url=f'http://{hostname}:5000/stage',
            json={
                'id': self.identifier,
                'cmd': self.command,
                'webhook': self.webhook,
                'options': {}
            }
        )
        
        return loads(response.text)
