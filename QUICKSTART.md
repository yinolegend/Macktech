# Quick Start Guide - Public Testing

This guide helps you quickly deploy the Macktech application for public testing.

## Option 1: Quick Local Test (No Docker)

Perfect for immediate testing on your local machine:

```bash
# 1. Clone the repository
git clone https://github.com/yinolegend/Macktech.git
cd Macktech

# 2. Install dependencies
cd backend
npm install

# 3. Start the server
npm start
```

The app will be available at `http://localhost:3000`

**Default credentials:**
- Username: `admin`
- Password: `admin`

⚠️ **Change these immediately in production!**

## Option 2: Docker Deployment (Recommended for Production)

### Prerequisites
- Docker and Docker Compose installed on your server
- A server with a public IP or domain name
- Port 3000 available (or configure a different port)

### Quick Deploy

```bash
# 1. Clone the repository
git clone https://github.com/yinolegend/Macktech.git
cd Macktech

# 2. Create environment file
cp .env.example .env

# 3. IMPORTANT: Edit .env and set a secure JWT_SECRET
# Generate a secure secret:
openssl rand -base64 32

# Edit .env file and replace JWT_SECRET value
nano .env

# 4. Build and start with Docker Compose
docker compose up -d --build

# 5. Check if it's running
docker compose logs -f
```

The app will be available at `http://your-server-ip:3000`

## Option 3: Production Deployment with Security

For internet-facing deployments, follow the comprehensive guide in [DEPLOYMENT.md](./DEPLOYMENT.md), which includes:
- SSL/HTTPS setup with nginx
- Security hardening
- Monitoring and logging
- Backup strategies

## Testing the Deployment

### 1. Verify Health
```bash
curl http://localhost:3000/__ping
```

Expected response:
```json
{"ok":true,"time":"2025-11-14T...","path":"/__ping","host":"..."}
```

### 2. Access the Application

Open your browser and navigate to:
- Landing page: `http://your-server:3000/`
- Admin panel: `http://your-server:3000/admin.html`
- Ticket form: `http://your-server:3000/Ticketform.html`
- Chat/Handbook: `http://your-server:3000/app.html`

### 3. Login as Admin

1. Click "Admin Login" on the landing page
2. Use credentials: `admin` / `admin`
3. **Change the password immediately**

### 4. Test Core Features

- [ ] Create a ticket from the ticket form
- [ ] Open chat and send a message
- [ ] Upload a handbook PDF to `backend/public/PDF handbook/`
- [ ] Create an announcement (admin only)
- [ ] View tickets in the admin panel

## Exposing to the Internet

### Quick Method (Testing Only - NOT for Production)

If you're behind a router and want to test:

1. **Port forwarding:** Forward port 3000 on your router to your server's local IP
2. **Access:** `http://your-public-ip:3000`

⚠️ **This is NOT secure for production use!**

### Production Method (Secure)

For production, you MUST:

1. **Get a domain name** (e.g., from Namecheap, GoDaddy, Cloudflare)
2. **Point domain to your server** (A record in DNS)
3. **Setup nginx reverse proxy** with SSL (Let's Encrypt)
4. **Follow security checklist** in DEPLOYMENT.md

Example nginx config snippet:
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Common Issues

### Port 3000 Already in Use
```bash
# Find what's using the port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm start
```

### Docker Build Fails
```bash
# Clean Docker cache
docker system prune -a

# Rebuild
docker compose build --no-cache
```

### Can't Connect from Outside
- Check firewall: `sudo ufw status`
- Allow port: `sudo ufw allow 3000`
- Check if service is listening: `netstat -tulpn | grep 3000`

### Database Locked Error
```bash
# Stop the application
docker compose down

# Remove database lock
rm data/.app.db-shm data/.app.db-wal

# Restart
docker compose up -d
```

## Public Testing Checklist

Before sharing with testers:

- [ ] Application starts without errors
- [ ] Health check endpoint responds
- [ ] Default admin password changed
- [ ] JWT_SECRET set to secure random value
- [ ] All core features tested (tickets, chat, handbook)
- [ ] Accessible from test users' networks
- [ ] Test data loaded (optional)
- [ ] Announcement system working (optional)

## Getting Help

- Check server logs: `docker compose logs -f` or `npm start` output
- Review [README.md](./README.md) for feature documentation
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment guide
- Check GitHub issues for known problems

## Next Steps After Testing

1. **Collect feedback** from testers on:
   - User experience
   - Performance
   - Missing features
   - Bugs or issues

2. **Security hardening** before production:
   - Follow DEPLOYMENT.md security checklist
   - Setup SSL/HTTPS
   - Configure backups
   - Setup monitoring

3. **Scale if needed:**
   - Migrate to PostgreSQL/MySQL for larger deployments
   - Add Redis for session management
   - Setup load balancing for multiple instances

## Cloud Deployment Options

### DigitalOcean
1. Create a Droplet (Ubuntu 22.04)
2. Follow Docker deployment steps above
3. Use DigitalOcean's networking for firewall

### AWS EC2
1. Launch an EC2 instance (t2.micro for testing)
2. Configure security group to allow port 3000
3. Follow Docker deployment steps

### Heroku
1. Create a Heroku app
2. Add `Dockerfile` support
3. Configure environment variables in Heroku dashboard
4. Deploy with `git push heroku main`

### Render / Railway
Both platforms support Docker and can deploy directly from GitHub with minimal configuration.

---

**Ready to deploy?** Start with Option 1 for local testing, then move to Option 2 with Docker for a more production-like environment.
