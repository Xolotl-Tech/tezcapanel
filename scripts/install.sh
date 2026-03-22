#!/bin/bash

set -e

# ==========================================
# Tezcapanel Installer PRO (Next + Prisma)
# Xolotl Tech ©
# ==========================================

APP_NAME="tezcapanel"
APP_DIR="/opt/tezcapanel"
REPO="https://github.com/Xolotl-Company/tezcapanel.git"
PORT=3000

log() {
  echo -e "[Tezcapanel] $1"
}

error_exit() {
  echo "❌ Error: $1"
  exit 1
}

# ROOT
[ "$EUID" -ne 0 ] && error_exit "Ejecuta como root"

# DETECT OS
. /etc/os-release
OS=$ID
log "Sistema: $OS"

# DEPENDENCIAS
install_deps() {
  log "Instalando dependencias..."

  case $OS in
    ubuntu|debian)
      apt update -y
      apt install -y curl wget git nginx ufw build-essential
      ;;
    centos|almalinux|rocky)
      yum update -y
      yum install -y curl wget git nginx gcc-c++ make
      systemctl enable firewalld --now
      ;;
    *)
      error_exit "Sistema no soportado"
      ;;
  esac
}

# NODE
install_node() {
  if command -v node >/dev/null 2>&1; then
    log "Node.js ya está instalado: $(node -v)"
    return
  fi

  log "Instalando Node.js LTS..."

  case $OS in
    ubuntu|debian)
      curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
      apt install -y nodejs
      ;;
    centos|almalinux|rocky)
      curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
      yum install -y nodejs
      ;;
    *)
      error_exit "Sistema no soportado para instalación de Node"
      ;;
  esac
}

# CLONAR
clone_repo() {
  log "Clonando proyecto..."

  mkdir -p $APP_DIR
  cd $APP_DIR

  if [ -d ".git" ]; then
    git pull
  else
    git clone $REPO .
  fi
}

# INSTALAR PROYECTO
setup_project() {
  log "Instalando dependencias..."
  npm install

  log "Configurando entorno..."

  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      cp .env.example .env
    else
      touch .env
    fi
  fi

  log "Configurando Prisma..."
  npx prisma generate || true

  log "Build Next.js..."
  npm run build
}

# SYSTEMD
create_service() {
  log "Creando servicio..."

  cat > /etc/systemd/system/tezcapanel.service <<EOF
[Unit]
Description=Tezcapanel Service
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=root
Environment=PORT=$PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reexec
  systemctl daemon-reload
  systemctl enable tezcapanel
}

# START
start_service() {
  log "Iniciando servicio..."
  systemctl restart tezcapanel
}

# NGINX
setup_nginx() {
  log "Configurando NGINX..."

  cat > /etc/nginx/sites-available/tezcapanel <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/tezcapanel /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default

  systemctl restart nginx
  systemctl enable nginx
}

# FIREWALL
setup_firewall() {
  log "Configurando firewall..."

  if command -v ufw >/dev/null; then
    ufw allow 80
    ufw allow 443
    ufw --force enable
  elif command -v firewall-cmd >/dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
  fi
}

# CLI
install_cli() {
  log "Instalando CLI..."

  cat > /usr/local/bin/tezcapanel <<'EOF'
#!/bin/bash

case "$1" in
  start) systemctl start tezcapanel ;;
  stop) systemctl stop tezcapanel ;;
  restart) systemctl restart tezcapanel ;;
  status) systemctl status tezcapanel ;;
  logs) journalctl -u tezcapanel -f ;;
  update)
    cd /opt/tezcapanel && git pull && npm install && npm run build && systemctl restart tezcapanel
    ;;
  *)
    echo "Uso: tezcapanel {start|stop|restart|status|logs|update}"
    ;;
esac
EOF

  chmod +x /usr/local/bin/tezcapanel
}

# FINAL
finish() {
  IP=$(curl -s ifconfig.me)

  echo ""
  echo "======================================"
  echo " 🚀 Tezcapanel instalado"
  echo ""
  echo " Accede en: http://$IP"
  echo ""
  echo " Comandos:"
  echo " tezcapanel status"
  echo " tezcapanel logs"
  echo " tezcapanel update"
  echo "======================================"
}

# RUN
install_deps
install_node
clone_repo
setup_project
create_service
start_service
setup_nginx
setup_firewall
install_cli
finish