import json
import urllib.request
import urllib.error
import uuid

base_url = 'http://127.0.0.1:8000/api/auth'
email = f'test{uuid.uuid4().hex[:6]}@example.com'
password = 'testpass123'

for action in ['register', 'login']:
    data = {'email': email, 'password': password}
    if action == 'register':
        data['name'] = 'Test User'
    url = f'{base_url}/{action}'
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            print(action.upper(), 'STATUS', r.status)
            print(r.read().decode())
    except urllib.error.HTTPError as e:
        print(action.upper(), 'STATUS', e.code)
        try:
            print(e.read().decode())
        except Exception as ex:
            print('READ_ERROR', ex)
    except Exception as e:
        print(action.upper(), 'ERROR', type(e).__name__, e)
