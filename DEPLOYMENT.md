# Deployment Guide - Macktech Chat & Ticket System

This guide covers deploying the Macktech application for public testing and production use.

## Quick Start - Docker Deployment (Recommended)

### 1. Prerequisites
- Docker and Docker Compose installed
- A server/VPS with at least 512MB RAM
- Open port 3000 (or your chosen port)

### 2. Production Deployment Steps

```bash
# Clone the repository
git clone https://github.com/yinolegend/Macktech.git
cd Macktech

# Create environment configuration
cp .env.example .env

# Edit .env and set a secure JWT_SECRET
# Generate one with: openssl rand -base64 32
nano .env

# Build and start with Docker Compose
docker compose up -d --build

# View logs
docker compose logs -f
```

The application will be available at `http://your-server-ip:3000`

### 3. Initial Admin Setup

The application creates a default admin user on first run:
- **Username:** `admin`
- **Password:** `admin`

⚠️ **IMPORTANT:** Change this password immediately after first login!

To create a custom admin user:
```bash
cd backend
npm install
node create_admin.js <username> <password> "<Display Name>"
```

## Alternative Deployment Methods

### Manual Deployment (Without Docker)

```bash
# Install Node.js 20 or higher
# Clone the repository
git clone https://github.com/yinolegend/Macktech.git
cd Macktech/backend

# Install dependencies
npm install --production

# Create data directory
mkdir -p ../data

# Set environment variables
export JWT_SECRET="your-secure-secret-here"
export NODE_ENV=production

# Start the server
npm start
```

### Using a Process Manager (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
cd Macktech/backend
pm2 start server.js --name macktech

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

## Production Configuration

### Environment Variables

Key environment variables to configure:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Set to `production` for production deployment
- `JWT_SECRET` - **REQUIRED** - Secure random string for JWT signing
- `JWT_EXPIRES_IN` - Token expiration time (default: 12h)

See `.env.example` for all available options.

### Reverse Proxy Setup (nginx)

For production, use nginx as a reverse proxy with SSL:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### SSL Certificates (Let's Encrypt)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com
```

## Security Considerations

### Essential Security Steps

1. **Change Default Credentials**
   - Change the default admin password immediately
   - Create unique admin accounts for each administrator

2. **Secure JWT Secret**
   - Generate a strong random secret: `openssl rand -base64 32`
   - Never commit the secret to version control
   - Store in environment variables or secure secret management

3. **Use HTTPS**
   - Always use SSL/TLS in production
   - Redirect all HTTP traffic to HTTPS
   - Use Let's Encrypt for free SSL certificates

4. **Firewall Configuration**
   - Only expose necessary ports (80, 443)
   - Block direct access to port 3000 from the internet
   - Use a reverse proxy (nginx, Traefik)

5. **Database Security**
   - The SQLite database is stored in `./data/app.db`
   - Ensure proper file permissions (600)
   - Regular backups recommended

6. **Update Dependencies**
   ```bash
   npm audit
   npm update
   ```

### Additional Security Measures

- Implement rate limiting for API endpoints
- Enable CORS only for trusted domains
- Regular security audits
- Monitor application logs
- Keep Node.js and system packages updated

## Testing Your Deployment

### Health Check

The application provides a health check endpoint:

```bash
curl http://localhost:3000/__ping
```

Expected response:
```json
{
  "ok": true,
  "time": "2025-11-14T16:00:00.000Z",
  "path": "/__ping",
  "host": "localhost:3000"
}
```

### Functional Tests

1. **Access the application:** Navigate to `http://your-server-ip:3000`
2. **Admin login:** Click "Admin Login" and use default credentials
3. **Create a ticket:** Test ticket creation functionality
4. **Test chat:** Open chat and send a message
5. **View handbook:** Check if handbook section loads

## Monitoring and Maintenance

### Docker Logs

```bash
# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f app
```

### Backup Strategy

```bash
# Backup the database
cp data/app.db data/app.db.backup-$(date +%Y%m%d)

# Backup announcements
cp backend/public/announcements.json backup/
```

### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build
```

## Troubleshooting

### Application won't start

1. Check logs: `docker compose logs`
2. Verify port 3000 is not in use: `netstat -tulpn | grep 3000`
3. Check file permissions on `data/` directory

### Database issues

1. Check if `data/app.db` exists and is writable
2. Try removing and letting it recreate: `rm data/app.db`

### Connection issues

1. Verify firewall allows port 3000
2. Check reverse proxy configuration
3. Ensure WebSocket connections are allowed

## Public Testing Checklist

Before opening for public testing:

- [ ] JWT_SECRET changed from default
- [ ] Default admin password changed
- [ ] HTTPS configured (for internet-facing deployments)
- [ ] Firewall rules configured
- [ ] Database backups configured
- [ ] Health check endpoint working
- [ ] All core features tested (tickets, chat, handbook)
- [ ] Reverse proxy configured (if applicable)
- [ ] Monitoring/logging in place

## Support

For issues or questions:
- Check the main README.md
- Review server logs
- Check GitHub issues

## Scaling Considerations

For production use with many users:
- Consider migrating from SQLite to PostgreSQL or MySQL
- Implement Redis for session storage
- Use a load balancer for multiple instances
- Add message queue for background jobs
- Implement database connection pooling
