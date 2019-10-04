from os.path import basename, join
from uuid import uuid4

from paramiko import AutoAddPolicy, SSHClient

from helpers import base64_dict, base64_str


def execute_entrypoint(payload):
    command = payload['cmd']
    webhook = payload['webhook']

    # Run container
    container = Srm2Local(identifier, command, webhook)
    result = container.run()

    return (result, 202)


class Srm2Local():
    
    def __init__(self, identifier, command, webhook):
        self.identifier = identifier
        self.command = command
        self.webhook = webhook

        self.container_uri = "shub://recap/MicroInfrastructure:srm2local"
    
    def run(self):
        srm_paths = self.command['src']['paths']
        srm_certificate = self.command['credentials']['srmCertificate']
        hpc_host = self.command['dest']['host']
        hpc_path = self.command['dest']['path']
        hpc_username = self.command['credentials']['hpcUsername']
        hpc_password = self.command['credentials']['hpcPassword']

        # Prepare webhook
        self.webhook['response'] = {
            'id': self.identifier
        }

        # Prepare arguments
        arguments = base64_dict({
            'copyjobfile': self.as_copyjobfile(srm_paths),
            'proxy': srm_certificate,
            'webhook': base64_dict(self.webhook)
        })

        # Open SSH connection to HPC
        client = SSHClient()
        client.set_missing_host_key_policy(AutoAddPolicy())
        client.connect(hpc_host, 22, hpc_username, hpc_password)

        # Run Singuliarty container using Slurm
        filename = f'job-{uuid4().hex[0:6]}.sh'
        bash = f'singularity run -B {hpc_path}:/local {self.container_uri} {arguments}'
        sbatch = 'sbatch -t 0-1:00'

        if hpc_host == 'pro.cyfronet.pl':
            sbatch += ' --partition=plgrid-testing'
            bash = 'module add plgrid/tools/singularity/stable' + '\n' + bash

        client.exec_command(f"""
            echo "$(date) {filename}" >> timestamps
        """)
        client.exec_command(f""" 
            echo "#!/bin/bash\n{bash}" > {filename} && {sbatch} {filename} && rm {filename}
        """)

        # Close SSH connection to HPC
        client.close()

        return {}

    def as_copyjobfile(self, paths):
        src_dest = [join(f'{path} file:////local/', basename(path)) for path in paths]
        return base64_str('\n'.join(src_dest))
