# automated-firebase
Automated Firebase Project Setup

## init

1. install gcloud into your host
1. setup application default credentials for authentication: `gcloud beta auth application-default login`
1. export credentials path, ex: `export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json"`
1. enable gcp and firebase API
1, prepare config file, refer to config.json
1. run: 'npm run exec [filename]'
