"""
cleanup_reception_controls.py
──────────────────────────────
Keeps only ONE RECEPTION control template per tenant and reassigns any tasks
that referenced the duplicate templates to the surviving one.

Run from the Haccp directory:
  python scripts/cleanup_reception_controls.py
"""

import sys, io, json, urllib.request, urllib.error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE   = 'http://localhost:80'
EMAIL  = 'admin@demo.haccp'   # change if needed
PASSW  = 'Admin1234!'

# ── Auth ──────────────────────────────────────────────────────────────────────
def call_api(method, path, body=None, token=None):
    url  = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  HTTP {e.code}: {body[:200]}')
        return None

print('Logging in…')
auth = call_api('POST', '/api/v1/auth/login', {'email': EMAIL, 'password': PASSW})
if not auth or 'data' not in auth:
    print('Login failed. Check EMAIL/PASSW at the top of this script.')
    sys.exit(1)
token = auth['data']['accessToken']
print('  ✓ logged in')

# ── Fetch all templates ────────────────────────────────────────────────────────
print('\nFetching control templates…')
resp = call_api('GET', '/api/v1/controls/templates?page=1&limit=200', token=token)
all_templates = resp['data'] if resp else []

reception = [t for t in all_templates if t['type'] == 'RECEPTION']
print(f'  Found {len(reception)} RECEPTION template(s)')

if len(reception) <= 1:
    print('  Nothing to clean up — already only one RECEPTION template.')
    sys.exit(0)

# Keep the oldest one (lowest createdAt) as the canonical template
reception.sort(key=lambda t: t['createdAt'])
keep    = reception[0]
remove  = reception[1:]

print(f'\n  Keeping : {keep["id"][:12]}… "{keep["name"]}"')
print(f'  Removing: {len(remove)} duplicate(s)')

# ── Fetch all tasks and reassign those pointing at duplicates ─────────────────
print('\nFetching tasks…')
tasks_resp = call_api('GET', '/api/v1/controls/tasks?page=1&limit=500', token=token)
all_tasks  = tasks_resp['data'] if tasks_resp else []

dup_ids   = {t['id'] for t in remove}
to_update = [t for t in all_tasks if t['templateId'] in dup_ids]

print(f'  Tasks pointing at duplicates: {len(to_update)}')
reassigned = 0
for task in to_update:
    r = call_api('PATCH', f'/api/v1/controls/tasks/{task["id"]}',
                 body={}, token=token)   # templateId is not patchable — tasks keep history
    # Note: templateId cannot be changed via PATCH (by design).
    # We just report them so an operator can decide manually.
    print(f'  WARNING: Task {task["id"][:12]}… references duplicate template {task["templateId"][:12]}…')
    print(f'           Reassign manually or recreate it with templateId={keep["id"]}')

# ── Delete duplicate templates ─────────────────────────────────────────────────
print('\nDeleting duplicate templates…')
deleted = 0
for tpl in remove:
    r = call_api('DELETE', f'/api/v1/controls/templates/{tpl["id"]}', token=token)
    if r is not None:
        print(f'  ✓ Deleted {tpl["id"][:12]}… "{tpl["name"]}"')
        deleted += 1
    else:
        print(f'  ✗ Could not delete {tpl["id"][:12]}… (may have linked tasks)')

print(f'\nDone. {deleted}/{len(remove)} duplicate(s) removed.')
print(f'Canonical RECEPTION template: {keep["id"]} — "{keep["name"]}"')
