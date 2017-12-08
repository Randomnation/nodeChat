#!/bin/bash

screen -X -S $(screen -ls | awk '/\.nodeChat\t/ {print strtonum($1)}') kill

screen -X -S $(screen -ls | awk '/\dynamodb\t/ {print strtonum($1)}') kill
