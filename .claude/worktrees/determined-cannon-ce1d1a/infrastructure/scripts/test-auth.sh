#!/bin/sh
echo '{"email":"admin@demo.com","password":"Password1!"}' > /tmp/login.json
wget -qO- --header='Content-Type: application/json' \
  --post-file=/tmp/login.json \
  http://auth-service:3010/api/v1/auth/login 2>&1
