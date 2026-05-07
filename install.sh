#!/bin/bash

set -e

APP_DIR="/opt/tezcapanel"
REPO="https://github.com/Xolotl-Tech/tezcapanel.git"
NODE_VERSION="20"
PANEL_PORT="8080"
AGENT_PORT="7070"
AGENT_WS_PORT="7071"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()    { echo -e "${GREEN}✔${NC} $1"; }
info()   { echo -e "${BLUE}→${NC} $1"; }
warn()   { echo -e "${YELLOW}⚠${NC} $1"; }
error()  { echo -e "${RED}✖ Error:${NC} $1"; exit 1; }
header() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

header "Verificando requisitos"
[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash install.sh"
log "Corriendo como root"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO=$ID
  DISTRO_VERSION=$VERSION_ID
  DISTRO_MAJOR=$(echo $VERSION_ID | cut -d. -f1)
else
  error "No se puede detectar el sistema operativo"
fi

log "Sistema detectado: $PRETTY_NAME"

case $DISTRO in
  ubuntu|debian)
    PKG_UPDATE="apt-get update -y"
    PKG_INSTALL="apt-get install -y"
    ;;
  rhel|centos|rocky|almalinux|fedora)
    PKG_UPDATE="dnf update -y"
    PKG_INSTALL="dnf install -y"
    if ! command -v dnf &>/dev/null; then
      PKG_UPDATE="yum update -y"
      PKG_INSTALL="yum install -y"
    fi
    ;;
  *)
    error "Distro no soportada: $DISTRO"
    ;;
esac

header "Instalando dependencias del sistema"
$PKG_UPDATE
case $DISTRO in
  ubuntu|debian)
    $PKG_INSTALL curl wget git build-essential
    ;;
  rhel|centos|rocky|almalinux|fedora)
    $PKG_INSTALL curl wget git gcc-c++ make
    if [[ "$DISTRO" == "rocky" || "$DISTRO" == "almalinux" ]]; then
      $PKG_INSTALL epel-release || true
    fi
    ;;
esac
log "Dependencias instaladas"

header "Instalando Node.js $NODE_VERSION LTS"
if command -v node &>/dev/null; then
  CURRENT_NODE=$(node -v | cut -d. -f1 | tr -d 'v')
  if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
    log "Node.js $(node -v) ya está instalado"
  else
    INSTALL_NODE=true
  fi
else
  INSTALL_NODE=true
fi

if [ "$INSTALL_NODE" = true ]; then
  case $DISTRO in
    ubuntu|debian)
      curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
      $PKG_INSTALL nodejs
      ;;
    rhel|centos|rocky|almalinux|fedora)
      curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
      $PKG_INSTALL nodejs python3 make gcc-c++
      ;;
  esac
fi
log "Node.js $(node -v) listo"

header "Descargando Tezcapanel"
if [ -d "$APP_DIR/.git" ]; then
  info "Actualizando instalación existente..."
  cd $APP_DIR
  git fetch origin
  git reset --hard origin/main
  log "Repositorio actualizado"
else
  info "Clonando repositorio..."
  mkdir -p $APP_DIR
  git clone $REPO $APP_DIR
  cd $APP_DIR
  log "Repositorio clonado"
fi
cd $APP_DIR

header "Instalando dependencias npm"
npm install --production=false
info "Compilando módulos nativos..."
npm rebuild node-pty
log "Dependencias instaladas"

header "Configurando entorno"
LOCAL_IP=$(hostname -I | awk '{print $1}')

if [ ! -f "$APP_DIR/.env" ]; then
  AUTH_SECRET=$(openssl rand -base64 32)
  AGENT_TOKEN=$(openssl rand -hex 32)
  cat > $APP_DIR/.env << EOF
DATABASE_URL="file:$APP_DIR/prisma/prod.db"
AUTH_SECRET="$AUTH_SECRET"
AUTH_TRUST_HOST=true
NEXTAUTH_URL="http://$LOCAL_IP:$PANEL_PORT"
AGENT_URL="http://127.0.0.1:$AGENT_PORT"
AGENT_TOKEN="$AGENT_TOKEN"
NODE_ENV="production"
PORT=$PANEL_PORT
EOF
  log "Archivo .env generado"
else
  warn ".env ya existe — verificando variables requeridas..."
  if ! grep -q "AUTH_TRUST_HOST" $APP_DIR/.env; then
    echo 'AUTH_TRUST_HOST=true' >> $APP_DIR/.env
    log "AUTH_TRUST_HOST agregado"
  fi
  if ! grep -q "NEXTAUTH_URL" $APP_DIR/.env; then
    echo "NEXTAUTH_URL=\"http://$LOCAL_IP:$PANEL_PORT\"" >> $APP_DIR/.env
    log "NEXTAUTH_URL agregado"
  fi
  AGENT_TOKEN=$(grep AGENT_TOKEN $APP_DIR/.env | cut -d'"' -f2)
fi

header "Inicializando base de datos"
cd $APP_DIR
npx prisma migrate deploy
npx prisma generate
log "Base de datos inicializada"

header "Compilando Tezcapanel"
npm run build
log "Build completado"

header "Configurando servicios del sistema"
cat > /etc/systemd/system/tezcapanel.service << EOF
[Unit]
Description=Tezcapanel Panel
After=network.target tezcaagent.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$(which node) server.js
Environment=PORT=$PANEL_PORT
Environment=HOSTNAME=0.0.0.0
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/tezcaagent.service << EOF
[Unit]
Description=Tezcapanel Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$(which node) agent/server.js
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tezcapanel tezcaagent
log "Servicios systemd creados"

header "Configurando firewall"
if command -v ufw &>/dev/null; then
  ufw allow $PANEL_PORT/tcp
  ufw allow $AGENT_WS_PORT/tcp
  ufw allow 22/tcp
  ufw --force enable
  log "UFW configurado"
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=$PANEL_PORT/tcp
  firewall-cmd --permanent --add-port=$AGENT_WS_PORT/tcp
  firewall-cmd --reload
  log "firewalld configurado"
else
  warn "No se detectó firewall — abre los puertos $PANEL_PORT y $AGENT_WS_PORT manualmente"
fi

header "Instalando CLI"
cat > /usr/local/bin/tezcapanel << 'CLIEOF'
#!/bin/bash
APP_DIR="/opt/tezcapanel"
case "$1" in
  start)    systemctl start tezcapanel tezcaagent ;;
  stop)     systemctl stop tezcapanel tezcaagent ;;
  restart)  systemctl restart tezcapanel tezcaagent ;;
  status)   systemctl status tezcapanel tezcaagent ;;
  logs)     journalctl -u tezcapanel -f ;;
  agent)    journalctl -u tezcaagent -f ;;
  update)
    cd $APP_DIR
    git fetch origin
    PREV_SHA=$(git rev-parse HEAD)
    git reset --hard origin/main
    NEW_SHA=$(git rev-parse HEAD)
    # Re-correr install.sh es idempotente: dnf detecta paquetes ya instalados,
    # npm hace nada si las deps no cambiaron, y los `cat > /etc/systemd/...`
    # sobreescriben las units si cambió ExecStart, y el `cat > /usr/local/bin/
    # tezcapanel` reescribe el CLI con los subcomandos nuevos. Sin esto, los
    # cambios al CLI o al systemd unit no llegaban a las VMs en updates.
    bash $APP_DIR/install.sh
    echo ""
    echo "✔ Tezcapanel actualizado: ${PREV_SHA:0:7} → ${NEW_SHA:0:7}"
    if [ "$PREV_SHA" != "$NEW_SHA" ]; then
      echo ""
      echo "Cambios incluidos:"
      git log --pretty=format:"  %h  %s" $PREV_SHA..$NEW_SHA | head -20
      echo ""
    fi
    ;;
  reset-password)
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Restablecer contraseña de administrador"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    # Si el usuario no recuerda el email, listamos los admins existentes
    # antes de pedirlo. node -e debe correr DESDE $APP_DIR, si no, el
    # resolver de Node busca node_modules a partir de la CWD del usuario
    # (típicamente /opt o ~) y no encuentra ni @prisma/client ni bcryptjs.
    cd $APP_DIR
    echo "Admins registrados:"
    node -e "
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, name: true } })
        .then(us => { us.forEach(u => console.log('  ' + u.email + (u.name ? ' (' + u.name + ')' : ''))); })
        .catch(() => console.log('  (no se pudo leer la BD)'))
        .finally(() => p.\$disconnect());
    " 2>/dev/null
    echo ""
    read -p "Email del admin: " ADMIN_EMAIL
    read -s -p "Nueva contraseña (mín. 8 caracteres): " NEW_PASS
    echo ""
    if [ ${#NEW_PASS} -lt 8 ]; then
      echo "❌ La contraseña debe tener al menos 8 caracteres"
      exit 1
    fi
    # Pasamos la contraseña por env en vez de interpolarla en el JS.
    # Evita romperse con comillas, $, backticks, etc., en el password.
    NEW_PASS="$NEW_PASS" ADMIN_EMAIL="$ADMIN_EMAIL" node -e "
      const bcrypt = require('bcryptjs');
      const { PrismaClient } = require('@prisma/client');
      (async () => {
        const prisma = new PrismaClient();
        try {
          const hash = await bcrypt.hash(process.env.NEW_PASS, 12);
          const u = await prisma.user.update({
            where: { email: process.env.ADMIN_EMAIL },
            data: { password: hash },
          });
          console.log('✔ Contraseña actualizada para:', u.email);
        } catch (e) {
          console.error('❌ Error:', e.message);
          process.exit(1);
        } finally {
          await prisma.\$disconnect();
        }
      })();
    "
    ;;
  default)
    # Equivalente a `bt default` de aaPanel: muestra URLs de acceso, puerto,
    # estado de servicios y los emails de admins registrados. NO imprime
    # contraseñas (no se guardan en plano). Si olvidaste la contraseña usa
    # `tezcapanel reset-password`.
    cd $APP_DIR
    PORT=$(grep -E "^PORT=" .env 2>/dev/null | cut -d= -f2 || echo 8080)
    PORT=${PORT:-8080}
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Tezcapanel — información de acceso"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "URLs de acceso:"
    # IPv4 públicas/privadas detectables sin tocar internet
    for ip in $(hostname -I 2>/dev/null); do
      echo "  http://${ip}:${PORT}/login"
    done
    PUBIP=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || true)
    [ -n "$PUBIP" ] && echo "  http://${PUBIP}:${PORT}/login   (IP pública detectada)"
    echo ""
    echo "Puerto del panel:    ${PORT}"
    echo "Servicios:"
    systemctl is-active --quiet tezcapanel && echo "  ✔ tezcapanel activo" || echo "  ✖ tezcapanel detenido"
    systemctl is-active --quiet tezcaagent && echo "  ✔ tezcaagent activo"  || echo "  ✖ tezcaagent detenido"
    systemctl is-enabled --quiet tezcapanel && echo "  ✔ auto-arranque al boot habilitado" || echo "  ⚠ auto-arranque deshabilitado (corre: sudo systemctl enable tezcapanel tezcaagent)"
    echo ""
    echo "Administradores registrados:"
    node -e "
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, name: true, createdAt: true } })
        .then(us => {
          if (!us.length) { console.log('  (ninguno — abre la URL y crea el primer admin)'); return; }
          us.forEach(u => console.log('  ' + u.email + (u.name ? ' (' + u.name + ')' : '')));
        })
        .catch(() => console.log('  (no se pudo leer la BD)'))
        .finally(() => p.\$disconnect());
    " 2>/dev/null
    echo ""
    echo "¿Olvidaste la contraseña?  →  sudo tezcapanel reset-password"
    echo ""
    ;;
  *)
    cat <<USAGE
Uso: tezcapanel <comando>

Comandos:
  start | stop | restart | status   Controlar los servicios
  logs                              Logs del panel en vivo
  agent                             Logs del agente en vivo
  default                           Mostrar URLs, puerto y admins
  update                            Actualizar a la última versión
  reset-password                    Cambiar contraseña de un admin
USAGE
    ;;
esac
CLIEOF
chmod +x /usr/local/bin/tezcapanel
# Alias corto: `tz` → `tezcapanel`. Igual que aaPanel expone `bt`.
ln -sf /usr/local/bin/tezcapanel /usr/local/bin/tz
log "CLI instalado"

header "Iniciando Tezcapanel"
systemctl restart tezcaagent
sleep 2
systemctl restart tezcapanel
sleep 3

if systemctl is-active --quiet tezcapanel; then
  log "Panel iniciado correctamente"
else
  warn "El panel no inició — revisa: journalctl -u tezcapanel"
fi

if systemctl is-active --quiet tezcaagent; then
  log "Agente iniciado correctamente"
else
  warn "El agente no inició — revisa: journalctl -u tezcaagent"
fi

PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null)

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Tezcapanel instalado exitosamente${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Panel (local):   ${BLUE}http://$LOCAL_IP:$PANEL_PORT${NC}"
echo -e "  Panel (público): ${BLUE}http://$PUBLIC_IP:$PANEL_PORT${NC}"
echo ""
echo -e "  Comandos útiles:"
echo -e "  ${YELLOW}tezcapanel status${NC}          — ver estado"
echo -e "  ${YELLOW}tezcapanel logs${NC}            — ver logs del panel"
echo -e "  ${YELLOW}tezcapanel agent${NC}           — ver logs del agente"
echo -e "  ${YELLOW}tezcapanel update${NC}          — actualizar"
echo -e "  ${YELLOW}tezcapanel reset-password${NC}  — restablecer contraseña admin"
echo ""
echo -e "  Al abrir el panel por primera vez se te pedirá"
echo -e "  crear tu cuenta de administrador."
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"