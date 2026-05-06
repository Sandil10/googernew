#!/usr/bin/env bash
set -euo pipefail

echo "Stopping and permanently disabling local PostgreSQL on this EC2 host..."

SERVICES=(
  postgresql
  postgresql-16
  postgresql-15
  postgresql-14
  postgresql-13
  postgresql-12
)

found=0

for service in "${SERVICES[@]}"; do
  if systemctl list-unit-files "${service}.service" --no-legend 2>/dev/null | grep -q "${service}.service"; then
    found=1
    echo "Disabling ${service}.service"
    sudo systemctl stop "${service}"
    sudo systemctl disable "${service}"
    sudo systemctl mask "${service}"
    sudo systemctl status "${service}" --no-pager || true
  fi
done

if [[ "${found}" -eq 0 ]]; then
  echo "No PostgreSQL systemd service was found."
fi

echo
echo "Done. PostgreSQL has been stopped, disabled at boot, and masked."
echo "If you ever need to re-enable it: sudo systemctl unmask <service> && sudo systemctl enable --now <service>"
