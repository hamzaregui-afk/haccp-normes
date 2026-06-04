# Cloudflare Configuration — files.normes-haccp.com

## Architecture
```
Client (HTTPS) → Cloudflare CDN → Hetzner Nginx → MinIO
```

## Step 1 — DNS Record

In Cloudflare Dashboard → DNS → Add Record:
```
Type:    A
Name:    files
Content: 178.105.126.165
Proxy:   ✅ Proxied (orange cloud) ← IMPORTANT for CDN+SSL
TTL:     Auto
```

## Step 2 — SSL/TLS Mode

Cloudflare Dashboard → SSL/TLS → Overview:
- Set mode: **Flexible** (Cloudflare HTTPS → Nginx HTTP)
- OR: **Full** if nginx has SSL configured (self-signed OK)

Recommended for Hetzner: **Flexible**
(Cloudflare handles public HTTPS, nginx receives HTTP from Cloudflare)

## Step 3 — Page Rules for Caching

Cloudflare Dashboard → Rules → Page Rules → Create Rule:

### Rule 1: Don't cache presigned MinIO URLs
```
URL: files.normes-haccp.com/*?*X-Amz-*
Setting: Cache Level → Bypass
```
This prevents Cloudflare from caching MinIO presigned URLs that contain
time-limited signatures.

### Rule 2: Cache static assets (long TTL)
```
URL: files.normes-haccp.com/*
Settings:
  Cache Level: Cache Everything
  Edge Cache TTL: 1 hour
  Browser Cache TTL: 1 hour
```

## Step 4 — Security Settings

Cloudflare Dashboard → Security:
- Security Level: Medium
- Bot Fight Mode: ✅ Enabled
- Browser Integrity Check: ✅ Enabled

Cloudflare Dashboard → Firewall Rules:
```
Rule: Block non-GET requests to files CDN
Expression: (http.host eq "files.normes-haccp.com") and (http.request.method ne "GET") and (http.request.method ne "HEAD")
Action: Block
```

## Step 5 — Performance

Cloudflare Dashboard → Speed → Optimization:
- Compression: ✅ Brotli
- HTTP/2: ✅ Enabled (default)
- HTTP/3: ✅ Enabled (default)

## Step 6 — Real IP Passthrough

The nginx.conf is already configured to trust Cloudflare IPs via:
```nginx
set_real_ip_from 103.21.244.0/22;
# ... (all Cloudflare ranges)
real_ip_header CF-Connecting-IP;
```

## Verification

After setup, test:
```bash
# Should return 200 and MinIO content
curl -I https://files.normes-haccp.com/haccp-control-photos/test

# Check Cloudflare headers
curl -I https://files.normes-haccp.com/ | grep -i "cf-\|server:\|x-cache"
```

Expected headers from Cloudflare:
- `server: cloudflare`
- `cf-cache-status: HIT` (for cached assets)
- `cf-cache-status: MISS` or `BYPASS` (for presigned URLs)
- `cf-ray: xxxxxxxxxxxxx`

## MinIO SDK Behavior

The code uses URL replacement:
```
http://minio:9000/bucket/key → https://files.normes-haccp.com/bucket/key
```

The HMAC signature in the URL was computed with `Host: minio:9000`.
Nginx passes `Host: minio:9000` to MinIO → signature validates correctly.

## Environment Variable

After Cloudflare setup, the production value of MINIO_PUBLIC_URL must be:
```
MINIO_PUBLIC_URL=https://files.normes-haccp.com
```
This is already set in docker-compose.yml.
