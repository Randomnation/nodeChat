#!/bin/bash

screen -S dynamodb -d -m java -Djava.library.path=/home/jhanson/dynamodb/DynamoDBLocal_lib -jar /home/jhanson/dynamodb/DynamoDBLocal.jar -sharedDb

screen -S nodeChat -d -m node server.js
