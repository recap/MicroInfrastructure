from docker import DockerClient
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
        servicePort = '5000/tcp'
        container = client.containers.run(
            image='lofar-stage2',
            auto_remove=True,
            detach=True,
            tty=True,
            network='lofar-net',
            environment={
                'LOFAR_USER': credentials['lofar_user'],
                'LOFAR_PASS': credentials['lofar_pass']
            }
        )

        sleep(1)
        container.reload()

        # bootstrap
        my_hostname = gethostname()
        co_hostname = container.attrs['Config']['Hostname']

        webhook = {
            'method': 'post',
            'url': f'http://{my_hostname}:5000/callback',
            'headers': []
        }

        self.command['webhook'] = webhook
        self.command['type'] = 'lofar'

        response = post(
            url=f'http://{co_hostname}:5000/stage',
            json={
                'id': self.identifier,
                'cmd': self.command,
                'options': {}
            }
        )
        
        print(response.text)
        return response
