#!/bin/bash
curl -s http://localhost:80/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"Password1!"}' | python3 -m json.tool 2>/dev/null || \
curl -s http://localhost:80/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"Password1!"}'
