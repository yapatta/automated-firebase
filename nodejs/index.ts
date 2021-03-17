import { google } from 'googleapis';
import fs from 'fs';
const firebase = google.firebase('v1beta1');
const cloudresourcemanager = google.cloudresourcemanager('v1');

// TODO: enable json config and parameter options
const config = {
  gcp: {
    projectName: 'automated-firebase-test',
    projectId: 'automated-firebase-test',
    firebase: {
      projectId: 'automated-firebase-test',
      locationId: 'asia-northeast1',
      android: {
        packageName: 'com.yapatta.testapp',
      },
      ios: {
        bundleId: 'com.yapatta.testapp',
        // appStoreId: ''
      },
    },
  },
};

async function main() {
  const authClient = await authorize();

  const { data, status } = await cloudresourcemanager.projects.list({
    auth: authClient,
  });
  if (status !== 200) {
    throw new Error('bad request: ' + String(status));
  }

  if (data.projects === undefined) {
    throw new Error('projects are undefined');
  }

  const selectedProjects = data.projects.filter((project) => {
    return (
      // projectId is unique: refer to 'https://cloud.google.com/resource-manager/reference/rest/v1/projects#Project'
      project.projectId === config.gcp.projectId &&
      project.lifecycleState === 'ACTIVE'
    );
  });

  let projectNumber: string;
  if (selectedProjects.length === 0) {
    const createdResponse = await cloudresourcemanager.projects.create({
      auth: authClient,
      requestBody: {
        projectId: config.gcp.projectId,
        name: config.gcp.projectName,
      },
    });
    if (createdResponse.status !== 200) {
      throw new Error('bad request: ' + String(createdResponse.status));
    }

    const gottenResponse = await cloudresourcemanager.projects.get({
      projectId: config.gcp.projectId,
    });

    if (gottenResponse.status !== 200) {
      throw new Error('bad request: ' + String(createdResponse.status));
    }

    projectNumber = gottenResponse.data.projectNumber ?? '';
  } else {
    projectNumber = selectedProjects.pop()!.projectNumber ?? '';
  }

  if (projectNumber === '') {
    throw new Error('unvalidated project number');
  }

  // create firebase project
  // TODO: distinguish wheter this project has been already created
  google.options({ auth: authClient });

  const firebaseProject = await firebase.projects.list();

  // NOTE: the value for PROJECT_IDENTIFIER in any response body will be the ProjectId
  const selectedFirbaseProjects = firebaseProject.data.results?.filter(
    (result) => {
      return (
        // projectNumber is globally unique: refer to 'https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects#FirebaseProject'
        result.projectNumber === projectNumber && result.state === 'ACTIVE'
      );
    },
  );

  let firebaseName: string;
  if (
    selectedFirbaseProjects === undefined ||
    selectedFirbaseProjects.length === 0
  ) {
    const firebaseResponse = await firebase.projects.addFirebase({
      project: 'projects/' + projectNumber,
    });

    if (firebaseResponse.status !== 200) {
      throw new Error('bad request: ' + String(firebaseResponse.status));
    }

    firebaseName = firebaseResponse.data.name ?? '';

    if (firebaseName === '') {
      throw new Error('unvalidated firebase name');
    }

    await firebase.projects.defaultLocation.finalize({
      parent: firebaseName,
      requestBody: {
        locationId: config.gcp.firebase.locationId,
      },
    });
  } else {
    firebaseName = selectedFirbaseProjects.pop()!.name ?? '';
    if (firebaseName === '') {
      throw new Error('unvalidated firebase name');
    }
  }

  const androidAppList = await firebase.projects.androidApps.list({
    parent: firebaseName,
  });

  const selectedAndroidAppList = androidAppList.data.apps?.filter((app) => {
    return app.packageName === config.gcp.firebase.android.packageName;
  });
  console.log('android list: ', selectedAndroidAppList);

  if (
    selectedAndroidAppList === undefined ||
    selectedAndroidAppList.length === 0
  ) {
    const androidAppResponse = await firebase.projects.androidApps.create({
      parent: firebaseName,
      requestBody: {
        packageName: config.gcp.firebase.android.packageName,
      },
    });

    if (androidAppResponse.status !== 200) {
      throw new Error('bad request: ' + String(androidAppResponse.status));
    }

    console.log('android res:', androidAppResponse);
  }

  const iosAppList = await firebase.projects.iosApps.list({
    parent: firebaseName,
  });

  const selectedIosAppList = iosAppList.data.apps?.filter((app) => {
    return app.bundleId === config.gcp.firebase.ios.bundleId;
  });
  console.log('ios list: ', selectedIosAppList);

  if (selectedIosAppList === undefined || selectedIosAppList.length === 0) {
    const iosAppResponse = await firebase.projects.iosApps.create({
      parent: firebaseName,
      requestBody: {
        bundleId: config.gcp.firebase.ios.bundleId,
      },
    });

    if (iosAppResponse.status !== 200) {
      throw new Error('bad request: ' + String(iosAppResponse.status));
    }

    console.log('ios res: ', iosAppResponse);
  }

  // get android list
  const l = await firebase.projects.androidApps.list({
    parent: firebaseName,
  });
  const tl = l.data.apps?.find((app) => {
    return app.packageName === config.gcp.firebase.android.packageName;
  });

  if (tl === undefined) {
    throw new Error('not found');
  }

  const conf = await firebase.projects.androidApps.getConfig({
    name: tl.name! + '/config',
  });
  console.log(conf);
  fs.writeFile(
    conf.data.configFilename!,
    Buffer.from(conf.data.configFileContents!, 'base64'),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    function (err) {},
  );
}

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/cloud-platform.read-only',
      'https://www.googleapis.com/auth/firebase',
      'https://www.googleapis.com/auth/firebase.readonly',
    ],
  });

  return await auth.getClient();
}

main().catch((err: Error) => {
  console.error('message: ', err.message);
});
