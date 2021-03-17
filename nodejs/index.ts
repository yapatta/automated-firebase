import { google } from 'googleapis';
const cloudresourcemanager = google.cloudresourcemanager('v1');

async function main() {
  // TODO: enable json config and parameter options
  const projectName = 'automated-firebase-test';
  const projectId = 'automated-firebase-test';

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
      project.projectId === projectId &&
      project.name === projectName &&
      project.lifecycleState === 'ACTIVE'
    );
  });

  if (selectedProjects.length === 0) {
    const createResponse = await cloudresourcemanager.projects.create({
      auth: authClient,
      requestBody: {
        projectId: projectId,
        name: projectName,
      },
    });
    if (createResponse.status !== 200) {
      throw new Error('bad request: ' + String(createResponse.status));
    }
  }
}

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  return await auth.getClient();
}

main().catch((err: Error) => {
  console.error('Message: ', err.message);
});
