import { daemonArgs } from './robotSpec.mjs';
import { unitsJson } from './servoUnits.mjs';

const base64 = (value) => Buffer.from(value).toString('base64');
const encodedLine = (name, value) => `printf '%s' '${base64(value)}' | base64 -d > "$stage/${name}"`;

function service(config) {
  const { spec, address, port, pairingCode } = config;
  const listen = address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`;
  const name = JSON.stringify(config.name)
    .replaceAll('%', '%%')
    .replaceAll('$', () => '$$');
  const args = [
    ...daemonArgs(spec, '%h/.local/share/basecase-robot').map((arg) => arg.replaceAll('\\', '/')),
    `--listen ${listen}`,
    `--name ${name}`,
    `--pairing-code ${pairingCode}`,
  ];

  return [
    '[Unit]',
    'Description=Basecase Robot Computer',
    'After=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=%h/.local/share/basecase-robot/robot-daemon ${args.join(' ')}`,
    'Restart=on-failure',
    'RestartSec=2',
    'UMask=0077',
    'NoNewPrivileges=yes',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

export function robotInstallScript(config) {
  return [
    'set -eu',
    'umask 077',
    'command -v systemctl >/dev/null',
    'command -v loginctl >/dev/null',
    'command -v journalctl >/dev/null',
    'systemctl --user show-environment >/dev/null',
    'loginctl enable-linger "$(id -un)" || { echo "Enable lingering for this SSH user with loginctl enable-linger." >&2; exit 1; }',
    'root="$HOME/.local/share/basecase-robot"',
    'units="$HOME/.config/systemd/user"',
    'mkdir -p "$root" "$units"',
    'chmod 700 "$root"',
    'stage=$(mktemp -d "$root/install.XXXXXX")',
    'trap \'rm -rf "$stage"\' EXIT HUP INT TERM',
    encodedLine('robot-daemon', config.binary),
    encodedLine('joint_map.json', config.encodedMap),
    encodedLine('calibration.json', JSON.stringify(config.calibration)),
    ...(config.spec.units ? [encodedLine('units.json', unitsJson(config.spec.units))] : []),
    encodedLine('basecase-robot.service', service(config)),
    'chmod 700 "$stage/robot-daemon"',
    '"$stage/robot-daemon" --family feetech --ids 1 --port /dev/basecase-install-lock-probe 2>"$stage/motor-lock" && exit 1',
    'grep -q "Real motors are locked in this build" "$stage/motor-lock" || { echo "The daemon failed its motor lock check." >&2; exit 1; }',
    'if systemctl --user cat basecase-robot.service >/dev/null 2>&1; then systemctl --user stop basecase-robot.service; fi',
    'mv "$stage/robot-daemon" "$root/robot-daemon"',
    'mv "$stage/joint_map.json" "$root/joint_map.json"',
    'mv "$stage/calibration.json" "$root/calibration.json"',
    ...(config.spec.units ? ['mv "$stage/units.json" "$root/units.json"'] : []),
    'mv "$stage/basecase-robot.service" "$units/basecase-robot.service"',
    'systemctl --user daemon-reload',
    'systemctl --user enable --now basecase-robot.service',
    'attempt=0',
    'ready=no',
    'while [ "$attempt" -lt 50 ]; do',
    '  invocation=$(systemctl --user show basecase-robot.service --property=InvocationID --value)',
    '  if [ -n "$invocation" ] && journalctl --user --unit=basecase-robot.service --output=cat --no-pager "_SYSTEMD_INVOCATION_ID=$invocation" | grep -q \'"event":"listening"\'; then ready=yes; break; fi',
    '  attempt=$((attempt + 1))',
    '  sleep 0.1',
    'done',
    '[ "$ready" = yes ] || { echo "The robot service didn’t open its network listener. Read journalctl --user -u basecase-robot.service." >&2; exit 1; }',
    'systemctl --user is-active --quiet basecase-robot.service',
    'code=$(sed -n \'s/.*"code": *"\\([0-9]\\{6\\}\\)".*/\\1/p\' "$root/pairing.json")',
    'if grep -Eq \'"code"[[:space:]]*:[[:space:]]*null\' "$root/pairing.json"; then code=paired; fi',
    '[ "${#code}" -eq 6 ] || { echo "The robot service has no pairing code." >&2; exit 1; }',
    'printf "BASECASE_PAIRING_CODE=%s\\n" "$code"',
    '',
  ].join('\n');
}
