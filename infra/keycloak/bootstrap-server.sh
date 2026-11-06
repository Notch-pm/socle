#!/usr/bin/env bash
# Préparation d'un VPS Debian 12 neuf pour Keycloak (README, étape 2).
# À lancer UNE fois, en root :  sudo bash bootstrap-server.sh
# Idempotent : le relancer ne casse rien.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root (sudo)." >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = "debian" ] || echo "⚠️  Script écrit pour Debian (détecté : ${ID:-?}) — on continue." >&2

ADMIN_USER="${SUDO_USER:-debian}"

echo "== Système à jour, fuseau Europe/Paris"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw unattended-upgrades cron
timedatectl set-timezone Europe/Paris
# Mises à jour de sécurité automatiques (paquets Debian seulement, pas Docker).
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Swap de 2 Go (le VPS-1 n'a que 4 Go de RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf

echo "== Docker (dépôt officiel)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
usermod -aG docker "$ADMIN_USER"

echo "== Pare-feu : SSH, HTTP, HTTPS seulement"
# Docker publie ses ports en contournant ufw : seul Caddy publie (80/443),
# Keycloak n'écoute que sur 127.0.0.1 et Postgres nulle part (docker-compose.yml).
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== SSH : connexion par clé uniquement (si une clé est installée)"
KEYS="/home/$ADMIN_USER/.ssh/authorized_keys"
if [ -s "$KEYS" ]; then
  cat > /etc/ssh/sshd_config.d/99-edilumen.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  systemctl reload ssh
  echo "   mots de passe SSH désactivés."
else
  echo "⚠️  Aucune clé dans $KEYS : mots de passe SSH LAISSÉS actifs."
  echo "   Installer la clé (README, étape 1) puis relancer ce script."
fi

echo "== Dossier de l'application"
install -d -o "$ADMIN_USER" -g "$ADMIN_USER" /opt/keycloak /opt/keycloak/backups

echo
echo "Terminé. Se déconnecter puis se reconnecter (groupe docker), puis README, étape 3."
