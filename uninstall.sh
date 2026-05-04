#!/bin/bash

set -e

APP_DIR="/opt/tezcapanel"
PANEL_PORT="8080"
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

[ "$EUID" -ne 0 ] && error "Ejecuta como root: sudo bash uninstall.sh"

PURGE_SITES=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --purge-sites) PURGE_SITES=1 ;;
    -y|--yes)      ASSUME_YES=1 ;;
    -h|--help)
      cat <<EOF
Uso: sudo bash uninstall.sh [opciones]

Opciones:
  -y, --yes         No pedir confirmación
  --purge-sites     Borrar también vhosts de Nginx (/etc/nginx/conf.d/*.conf
                    creados por el panel) y document roots en /var/www.
                    NO borra MariaDB, PHP-FPM, Node.js ni Let's Encrypt.

Lo que SÍ borra siempre:
  - Servicios systemd: tezcapanel, tezcaagent
  - CLI: /usr/local/bin/tezcapanel
  - Código y base de datos: /opt/tezcapanel
  - Reglas de firewall para los puertos del panel

Lo que NO borra (decide a mano):
  - MariaDB / MySQL          (dnf remove mariadb-server)
  - PHP-FPM                  (dnf remove php-fpm php-*)
  - Node.js                  (dnf remove nodejs)
  - Certificados Let's Encrypt  (rm -rf /etc/letsencrypt)
EOF
      exit 0
      ;;
  esac
done

header "Desinstalación de Tezcapanel"
warn "Esto borra el panel, el agente, la base de datos local y la configuración."
[ $PURGE_SITES -eq 1 ] && warn "--purge-sites activo: también se borrarán vhosts y /var/www/*."

if [ $ASSUME_YES -ne 1 ]; then
  read -p "¿Continuar? (escribe 'yes'): " CONFIRM
  [ "$CONFIRM" != "yes" ] && { info "Cancelado."; exit 0; }
fi

header "Deteniendo servicios"
for svc in tezcapanel tezcaagent; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
    log "$svc detenido"
  else
    info "$svc no estaba registrado"
  fi
done

header "Borrando units de systemd"
rm -f /etc/systemd/system/tezcapanel.service
rm -f /etc/systemd/system/tezcaagent.service
systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true
log "units removidas"

header "Borrando CLI"
if [ -f /usr/local/bin/tezcapanel ]; then
  rm -f /usr/local/bin/tezcapanel
  log "/usr/local/bin/tezcapanel borrado"
else
  info "CLI no estaba instalado"
fi

header "Cerrando puertos en el firewall"
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw delete allow ${PANEL_PORT}/tcp 2>/dev/null || true
  ufw delete allow ${AGENT_WS_PORT}/tcp 2>/dev/null || true
  log "ufw: reglas removidas"
elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --remove-port=${PANEL_PORT}/tcp 2>/dev/null || true
  firewall-cmd --permanent --remove-port=${AGENT_WS_PORT}/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  log "firewalld: reglas removidas"
else
  info "No se detectó firewall activo"
fi

if [ $PURGE_SITES -eq 1 ]; then
  header "Borrando vhosts y document roots"
  # install.sh y web-agent escriben aquí. Sólo tocamos archivos que coincidan
  # con el patrón de los vhosts del panel (marcador en el comentario).
  if [ -d /etc/nginx/conf.d ]; then
    for f in /etc/nginx/conf.d/*.conf; do
      [ -f "$f" ] || continue
      if head -3 "$f" | grep -q "tezcapanel"; then
        rm -f "$f"
        log "vhost removido: $f"
      fi
    done
    if command -v nginx &>/dev/null; then
      nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || warn "nginx -t falló, revisa la configuración"
    fi
  fi
  if [ -d /var/www ]; then
    warn "Borrando /var/www/* (sitios servidos por el panel)"
    rm -rf /var/www/*
    log "/var/www vaciado"
  fi
fi

header "Borrando código y base de datos"
if [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR"
  log "$APP_DIR borrado"
else
  info "$APP_DIR no existía"
fi

header "Verificación"
MISSING=0
[ -f /usr/local/bin/tezcapanel ]              && { warn "CLI sigue presente"; MISSING=1; }
[ -f /etc/systemd/system/tezcapanel.service ] && { warn "unit del panel sigue presente"; MISSING=1; }
[ -f /etc/systemd/system/tezcaagent.service ] && { warn "unit del agente sigue presente"; MISSING=1; }
[ -d "$APP_DIR" ]                             && { warn "$APP_DIR sigue presente"; MISSING=1; }

if [ $MISSING -eq 0 ]; then
  log "Tezcapanel desinstalado"
  echo ""
  info "Lo que NO se tocó (bórralo a mano si ya no lo usas):"
  echo "    - MariaDB:        sudo dnf remove mariadb-server"
  echo "    - PHP-FPM:        sudo dnf remove php-fpm php-*"
  echo "    - Node.js:        sudo dnf remove nodejs"
  echo "    - Let's Encrypt:  sudo rm -rf /etc/letsencrypt"
  [ $PURGE_SITES -ne 1 ] && echo "    - Vhosts/sitios:  vuelve a correr con --purge-sites"
else
  error "Quedaron restos, revisa los warnings de arriba"
fi
