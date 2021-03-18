import { cloudresourcemanager_v1, firebase_v1beta1, google } from 'googleapis';
import fs from 'fs';

interface JSONConfig {
  gcp: {
    projectName: string;
    projectId: string;
    firebase: {
      projectId: string;
      locationId: string;
      android: {
        packageName: string;
      };
      ios: {
        bundleId: string;
      };
    };
  };
}

const firebase = google.firebase('v1beta1');
const cloudresourcemanager = google.cloudresourcemanager('v1');

const [, , firstArg] = process.argv;

if (!firstArg) {
  throw new Error('please set config json filename');
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const config: JSONConfig = JSON.parse(fs.readFileSync(firstArg, 'utf8'));

async function main() {
  const authClient = await authorize();
  google.options({ auth: authClient });

  console.log('[step 1] creating GCP project');
  const projectNumber = await createGcpProjectIfNotExist(authClient);

  console.log('[step 2] creating firebase project');
  const firebaseProjectName = await createFirebaseProjectIfNotExist(
    projectNumber,
  );

  console.log('[step 3] creating android app');
  await createAndroidAppIfNotExist(firebaseProjectName);
  console.log('[step 4] creating ios app');
  await createIosAppIfNotExist(firebaseProjectName);

  console.log('[step 5] writing android app config to file');
  await outputAndroidConfig(firebaseProjectName);
  console.log('[step 6] writing ios app config to file');
  await outputIosConfig(firebaseProjectName);
}

async function sleep(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec));
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

async function createGcpProjectIfNotExist(
  authClient: ReturnType<typeof authorize> extends Promise<infer T> ? T : never,
): Promise<string> {
  const { data, status } = await cloudresourcemanager.projects.list({
    auth: authClient,
  });

  if (status !== 200) {
    throw new Error('bad request: ' + String(status));
  }

  const selectedProject = data.projects?.find((project) => {
    return (
      // projectId is unique: refer to 'https://cloud.google.com/resource-manager/reference/rest/v1/projects#Project'
      project.projectId === config.gcp.projectId &&
      project.lifecycleState === 'ACTIVE'
    );
  });

  let projectNumber: string;
  if (selectedProject === undefined) {
    const operation = await cloudresourcemanager.projects.create({
      auth: authClient,
      requestBody: {
        projectId: config.gcp.projectId,
        name: config.gcp.projectName,
      },
    });

    if (operation.status !== 200) {
      throw new Error('bad request: ' + String(operation.status));
    }

    // NOTE: after creating GCP project, sometimes cannot get gcp project due to time problems
    let createdProject: cloudresourcemanager_v1.Schema$Project;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fetchedProjects = (await cloudresourcemanager.projects.list()).data;
      const cp = fetchedProjects.projects?.find((project) => {
        return (
          project.projectId === config.gcp.projectId &&
          project.lifecycleState === 'ACTIVE'
        );
      });
      if (cp) {
        createdProject = cp;
        break;
      }
      await sleep(1000);
    }

    projectNumber = createdProject.projectNumber ?? '';

    console.log('created GCP project:', projectNumber);
  } else {
    projectNumber = selectedProject.projectNumber ?? '';

    console.log(
      'skiped this step since GCP project has already been created:',
      projectNumber,
    );
  }

  if (projectNumber === '') {
    throw new Error('unvalidated project number');
  }

  return projectNumber;
}

async function createFirebaseProjectIfNotExist(
  projectNumber: string,
): Promise<string> {
  const projects = (await firebase.projects.list()).data;

  // NOTE: the value for PROJECT_IDENTIFIER in any response body will be the ProjectId
  const selectedProject = projects.results?.find((result) => {
    return (
      // projectNumber is globally unique: refer to 'https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects#FirebaseProject'
      result.projectNumber === projectNumber && result.state === 'ACTIVE'
    );
  });

  let firebaseName: string;
  if (selectedProject === undefined) {
    const operation = await firebase.projects.addFirebase({
      project: 'projects/' + projectNumber,
    });

    if (operation.status !== 200) {
      throw new Error('bad request: ' + String(operation.status));
    }

    // NOTE: after creating Firebase Project, sometimes cannot get App due to time problems
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const projectList = (await firebase.projects.list()).data;

      const pj = projectList.results?.find((result) => {
        return (
          // projectNumber is globally unique: refer to 'https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects#FirebaseProject'
          result.projectNumber === projectNumber && result.state === 'ACTIVE'
        );
      });

      if (pj) {
        break;
      }
      await sleep(1000);
    }

    firebaseName = 'projects/' + config.gcp.projectName;

    console.log('created firebase project:', firebaseName);

    await firebase.projects.defaultLocation.finalize({
      parent: 'projects/' + projectNumber,
      requestBody: {
        locationId: config.gcp.firebase.locationId,
      },
    });

    console.log('finalized location:', config.gcp.firebase.locationId);
  } else {
    firebaseName = selectedProject.name ?? '';
    if (firebaseName === '') {
      throw new Error('unvalidated firebase name');
    }

    console.log(
      'skiped this step since Firebase project has already been created:',
      firebaseName,
    );
  }

  return firebaseName;
}

async function createAndroidAppIfNotExist(projectName: string) {
  const appList = (
    await firebase.projects.androidApps.list({
      parent: projectName,
    })
  ).data;

  const selectedApp = appList.apps?.find((app) => {
    return app.packageName === config.gcp.firebase.android.packageName;
  });

  if (selectedApp === undefined) {
    const operation = await firebase.projects.androidApps.create({
      parent: projectName,
      requestBody: {
        packageName: config.gcp.firebase.android.packageName,
      },
    });

    if (operation.status !== 200) {
      throw new Error('bad request: ' + String(operation.status));
    }

    console.log('created new Android App on', projectName);
  } else {
    console.log(
      'skiped this step since Android App has already been created:',
      selectedApp.name,
    );
  }
}

async function createIosAppIfNotExist(projectName: string) {
  const appList = (
    await firebase.projects.iosApps.list({
      parent: projectName,
    })
  ).data;

  const selectedApp = appList.apps?.find((app) => {
    return app.bundleId === config.gcp.firebase.ios.bundleId;
  });

  if (selectedApp === undefined) {
    const operation = await firebase.projects.iosApps.create({
      parent: projectName,
      requestBody: {
        bundleId: config.gcp.firebase.ios.bundleId,
      },
    });

    if (operation.status !== 200) {
      throw new Error('bad request: ' + String(operation.status));
    }

    console.log('created new IOS App on', projectName);
  } else {
    console.log(
      'skiped this step since IOS App has already been created:',
      selectedApp.name,
    );
  }
}

async function outputAndroidConfig(projectName: string): Promise<void> {
  // NOTE: after creating Android App, sometimes cannot get App due to time problems
  let selectedApp: firebase_v1beta1.Schema$AndroidApp;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const appList = (
      await firebase.projects.androidApps.list({
        parent: projectName,
      })
    ).data;

    const app = appList.apps?.find((app) => {
      return app.packageName === config.gcp.firebase.android.packageName;
    });

    if (app) {
      selectedApp = app;
      break;
    }
    await sleep(1000);
  }

  const appConfig = (
    await firebase.projects.androidApps.getConfig({
      name: selectedApp.name! + '/config',
    })
  ).data;

  const configFilename = appConfig.configFilename ?? '';
  const configFileContents = appConfig.configFileContents ?? '';

  if (appConfig.configFileContents === '' || appConfig.configFilename === '') {
    throw new Error('app config not found');
  }

  fs.writeFile(
    configFilename,
    Buffer.from(configFileContents, 'base64'),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    function (err) {},
  );

  console.log('successful output of Android App config:', configFilename);
}

async function outputIosConfig(projectName: string): Promise<void> {
  // NOTE: after creating IOS App, sometimes cannot get App due to time problems
  let selectedApp: firebase_v1beta1.Schema$IosApp;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const appList = (
      await firebase.projects.iosApps.list({
        parent: projectName,
      })
    ).data;

    const app = appList.apps?.find((app) => {
      return app.bundleId === config.gcp.firebase.ios.bundleId;
    });

    if (app) {
      selectedApp = app;
      break;
    }
    await sleep(1000);
  }

  const appConfig = (
    await firebase.projects.iosApps.getConfig({
      name: selectedApp.name! + '/config',
    })
  ).data;

  const configFilename = appConfig.configFilename ?? '';
  const configFileContents = appConfig.configFileContents ?? '';

  if (appConfig.configFileContents === '' || appConfig.configFilename === '') {
    throw new Error('ios app config not found');
  }

  fs.writeFile(
    configFilename,
    Buffer.from(configFileContents, 'base64'),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    function (err) {},
  );

  console.log('successful output of IOS App config:', configFilename);
}

main().catch((err: Error) => {
  console.error('error message: ', err.message);
});
