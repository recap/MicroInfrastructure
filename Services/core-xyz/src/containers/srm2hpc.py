from helpers import base64_dict, base64_str
from paramiko import SSHClient, AutoAddPolicy
from uuid import uuid4

class Srm2Hpc():
    
    def __init__(self, identifier, command, webhook):
        self.identifier = identifier
        self.command = command
        self.webhook = webhook

        self.container_uri = "shub://process-xyz/singularity-srm2local"
    
    def run(self):
        srm_paths = self.command['src']['paths']
        srm_certificate = self.command['credentials']['srmCertificate']
        hpc_host = self.command['dest']['host']
        hpc_path = self.command['dest']['path']
        hpc_username = self.command['credentials']['hpcUsername']
        hpc_password = self.command['credentials']['hpcPassword']

        # Prepare arguments
        arguments = base64_dict({
            'copyjobfile': self.as_copyjobfile(srm_paths),
            'certificate': srm_certificate,
            'webhook': base64_dict(self.webhook)
        })

        # Open SSH connection to HPC
        client = SSHClient()
        client.set_missing_host_key_policy(AutoAddPolicy())
        client.connect(hpc_host, 22, hpc_username, hpc_password)

        # Run Singuliarty container using Slurm
        filename = f'job-{uuid4().hex[0:6]}.sh'
        bash = f'singularity run -B {hpc_path}:/local {self.container_uri} {arguments}'
        client.exec_command(f""" 
            echo "#!/bin/bash\n{bash}" > {filename} && sbatch {filename} && rm {filename}
        """)

        # Close SSH connection to HPC
        client.close()

    def as_copyjobfile(self, paths):
        src_dest = [f'{path} file:////local' for path in paths]
        return base64_str('\n'.join(src_dest))
