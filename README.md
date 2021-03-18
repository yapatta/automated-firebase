# Automated Firebase Project Setup

Automated Firebase Project Setup CLI Tool

## Steps

1. install gcloud command-line tool into your host
1. setup application default credentials for authentication: `gcloud beta auth application-default login`
1. enable gcp and firebase API access
1. set current directory to `./nodejs`
1. prepare config file such as `config.json`
1. run: `npm run exec [filename]`

## TODO

- [x] specify all the parameters via json configuration file
- [x] create a GCP Project
- [x] add Firebase to the new GCP Project
- [x] configure an android app in the Firebase project
- [x] configure an ios app in the Firebase project
- [x] download the android app configuration and store it on the local filesystem as a json file
- [x] download the ios app configuration and store it on the local filesystem as a json file
