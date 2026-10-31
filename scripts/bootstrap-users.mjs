const required = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "BOOTSTRAP_ADMIN_PASSWORD", "BOOTSTRAP_USER_PASSWORD"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}; set it locally in an ignored env file first.`);
}
for (const name of ["BOOTSTRAP_ADMIN_PASSWORD", "BOOTSTRAP_USER_PASSWORD"]) {
  if (process.env[name].length < 8 || process.env[name].length > 72) throw new Error(`${name} must be 8–72 characters.`);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY;
const accounts = [
  { username: "jeerasak", role: "admin", password: process.env.BOOTSTRAP_ADMIN_PASSWORD },
  { username: "user1", role: "user", password: process.env.BOOTSTRAP_USER_PASSWORD },
];

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${body.msg ?? body.message ?? "check project status and credentials"}`);
  return body;
}

const list = await api("/auth/v1/admin/users?per_page=1000&page=1");
for (const account of accounts) {
  const email = `${account.username}@auth.power-monitor.invalid`;
  let user = list.users?.find(item => item.email === email);
  if (user) {
    const profiles = await api(`/rest/v1/profiles?select=username,role,status&id=eq.${encodeURIComponent(user.id)}`);
    const profile = profiles[0];
    if (profile?.username === account.username && profile.role === account.role && profile.status === "approved") {
      console.log(`${account.username} is already provisioned (${account.role}, approved)`);
      continue;
    }
    throw new Error(`The ${account.username} identity already exists but is not a verified bootstrap account; inspect it manually before changing privileges.`);
  }
  user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: account.password, email_confirm: true, user_metadata: { username: account.username } }),
  });
  const authUser = user.user ?? user;
  const profiles = await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ username: account.username, role: account.role, status: "approved", updated_at: new Date().toISOString() }),
  });
  if (!profiles.length) throw new Error(`Profile provisioning failed for ${account.username}; check the auth-user trigger and table grants.`);
  console.log(`Provisioned ${account.username} (${account.role}, approved)`);
}
console.log("Initial accounts are ready. Rotate both passwords after first sign-in.");
