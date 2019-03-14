#!/bin/bash

#SBATCH -p gpu
#SBATCH --time=1:00:00


#Run program
cd UC1/PROCESS_UC1
singularity run --nv ../../process-uc1-2.simg cnn.py load train 0 1

