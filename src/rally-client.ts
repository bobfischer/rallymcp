export const RALLY_BASE_URL = 'https://rally1.rallydev.com/slm/webservice/v2.0';

const API_KEY = process.env.RALLY_API_KEY!;
export const WORKSPACE_REF = process.env.RALLY_WORKSPACE_REF!;
export const PROJECT_REF = process.env.RALLY_PROJECT_REF!;

const headers = (): Record<string, string> => ({
  'ZSESSIONID': API_KEY,
  'Content-Type': 'application/json',
});

export async function getSecurityToken(): Promise<string> {
  const res = await fetch(`${RALLY_BASE_URL}/security/authorize`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Rally auth failed: ${res.status}`);
  }
  const data = await res.json();
  return data.OperationResult.SecurityToken;
}

export async function rallyGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${RALLY_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function rallyPost(path: string, body: Record<string, any>): Promise<any> {
  const token = await getSecurityToken();
  const url = `${RALLY_BASE_URL}${path}?key=${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function rallyPut(path: string, body: Record<string, any>): Promise<any> {
  const token = await getSecurityToken();
  const url = `${RALLY_BASE_URL}${path}?key=${token}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function rallyDelete(path: string): Promise<any> {
  const token = await getSecurityToken();
  const url = `${RALLY_BASE_URL}${path}?key=${token}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
