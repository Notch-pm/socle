#!/usr/bin/env bash
# Sauvegarde quotidienne de la base Keycloak (README, étape 7).
# Planifiée par cron :  30 3 * * *  /opt/keycloak/backup.sh >> /opt/keycloak/backups/backup.log 2>&1
#
# Ce qui est sauvegardé : realms, clients, fournisseurs d'identité des collectivités,
# comptes locaux et sessions. Rien d'autre n'est à sauvegarder sur ce serveur
# (la configuration est dans le dépôt, les secrets dans .env — à garder aussi
# dans le gestionnaire de mots de passe).
#
# ⚠️ Ces fichiers restent SUR le VPS : ils protègent d'une erreur de manipulation,
# pas de la perte du serveur. La sauvegarde automatique OVH couvre ce second cas ;
# une copie hors serveur (Object Storage) est à ajouter (roadmap).
set -euo pipefail

cd /opt/keycloak
DEST=/opt/keycloak/backups
KEEP_DAYS=14
FILE="$DEST/keycloak-$(date +%Y%m%d-%H%M).sql.gz"

docker compose exec -T postgres pg_dump -U keycloak -d keycloak --clean --if-exists \
  | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"

find "$DEST" -name 'keycloak-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
