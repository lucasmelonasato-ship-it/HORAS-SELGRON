#!/bin/sh
# Atualiza a versão do app (app.js + version.json). Rodar antes de cada publicação.
# Os usuários com o app aberto recebem o aviso "versão nova → Atualizar agora".
set -e
cd "$(dirname "$0")/.."
V=$(TZ=America/Sao_Paulo date +%Y.%m.%d-%H%M)
sed -i "s/^const APP_VERSION = '[^']*'/const APP_VERSION = '$V'/" app.js
printf '{ "v": "%s" }\n' "$V" > version.json
echo "versão $V"
