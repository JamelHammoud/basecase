const ID = /^policy-[a-z0-9-]{1,100}$/;
const FILE =
  /^(?:model\.xml|job\.json|demos\.json|warm-policy\.json|warm\/(?:policy|resume)\.json|forge-train|libmujoco\.so\.\d+\.\d+\.\d+)$/;
const HASH = /^[a-f0-9]{64}$/;

export const LOG_BYTES = 1024 * 1024;
export const ARTIFACT_BYTES = 64 * 1024 * 1024;

export function remoteDirectory(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('The remote training job id is malformed.');

  return `"$HOME/.local/share/basecase/training/${id}"`;
}

export function uploadFile(name, bytes) {
  if (!FILE.test(name)) throw new Error('The remote input file name is malformed.');

  const encoded = bytes.toString('base64');

  return `mkdir -p warm\nbase64 -d > '${name}.partial' <<'BASECASE_BYTES'\n${encoded}\nBASECASE_BYTES\nmv '${name}.partial' '${name}'\n`;
}

export function inputManifest(hashes) {
  const entries = Object.entries(hashes);

  if (!entries.length || entries.some(([name, hash]) => !FILE.test(name) || !HASH.test(hash)))
    throw new Error('The remote input manifest is malformed.');

  return entries.map(([name, hash]) => `${hash}  ${name}`).join('\n');
}

function affinityScript(slot) {
  return `cores=$(awk '$1 == "Cpus_allowed_list:" { n = split($2, groups, ","); count = 0; for (i = 1; i <= n && count < 2; i++) { split(groups[i], range, "-"); last = range[2] == "" ? range[1] : range[2]; for (cpu = range[1]; cpu <= last && count < 2; cpu++) { print cpu; count++ } } }' /proc/self/status)
core=$(printf '%s\\n' "$cores" | awk 'NR == 1 { first = $1 } NR == ${slot === 1 ? 2 : 1} { selected = $1 } END { print selected == "" ? first : selected }')
taskset -pc "$core" "$$" >/dev/null || { printf '1\\n' > exit; exit 0; }
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 RAYON_NUM_THREADS=1
`;
}

export function workerScript(slot = 0, grouped = false) {
  return `umask 077
prlimit --pid "$$" --fsize=${ARTIFACT_BYTES}:${ARTIFACT_BYTES} || { printf '1\\n' > exit; exit 0; }
printf '%s\\n' "$$" > pid
exec 8>../cpu-${slot === 1 ? 1 : 0}.lock
flock 8
if test -f stop; then printf '125\\n' > exit; exit 0; fi
${grouped ? affinityScript(slot) : ''}
LD_LIBRARY_PATH="$PWD" ./forge-train --check >/dev/null || { printf '1\\n' > exit; exit 0; }
mkfifo events.pipe
awk '{ line = substr($0, 1, 65536); n += length(line) + 1; if (n > ${LOG_BYTES}) { close("events.log"); printf "" > "events.log"; close("events.log"); n = length(line) + 1 } print line >> "events.log"; close("events.log") }' < events.pipe &
reader=$!
LD_LIBRARY_PATH="$PWD" ./forge-train --job "$PWD" > events.pipe 2>&1
code=$?
wait "$reader"
rm -f events.pipe
printf '%s\\n' "$code" > exit.partial
mv exit.partial exit
`;
}

export function dispatchScript(descriptor, files) {
  const dir = remoteDirectory(descriptor.id);
  const manifest = inputManifest(descriptor.inputHashes);
  const worker = Buffer.from(workerScript(descriptor.slot, descriptor.grouped)).toString('base64');

  return `set -eu
umask 077
dir=${dir}
mkdir -p "$dir"
cd "$dir"
exec 9>dispatch.lock
flock 9
if test -d started; then exit 0; fi
if test -f stop; then printf '125\\n' > exit; exit 0; fi
storage=$(du -sk .. | cut -f 1)
test "$storage" -le 8388608
${Object.entries(files)
  .map(([name, bytes]) => uploadFile(name, bytes))
  .join('')}
cat > inputs.sha256 <<'BASECASE_HASHES'
${manifest}
BASECASE_HASHES
sha256sum --check --status inputs.sha256
chmod 700 forge-train
base64 -d > run.sh <<'BASECASE_WORKER'
${worker}
BASECASE_WORKER
if mkdir started 2>/dev/null; then
  date +%s > started/time
  cat /proc/sys/kernel/random/boot_id > started/boot
  nohup sh run.sh >/dev/null 2>&1 </dev/null 9>&- &
  printf '%s\\n' "$!" > pid
fi
`;
}

const artifactScript = (name) => `
if test -f '${name}'; then
  bytes=$(wc -c < '${name}')
  test "$bytes" -le ${ARTIFACT_BYTES}
  hash=$(sha256sum '${name}')
  hash=$(printf '%s' "$hash" | cut -c 1-64)
  printf ',"${name}":{"hash":"%s","data":"' "$hash"
  base64 -w 0 '${name}'
  printf '"}'
fi
`;

export function pollScript(descriptor) {
  const dir = remoteDirectory(descriptor.id);

  return `set -eu
cd ${dir}
state=running
code=0
if test -f exit; then
  code=$(cat exit)
  case "$code" in ''|*[!0-9]*) exit 1 ;; esac
  state=done
elif test -f pid; then
  pid=$(cat pid)
  case "$pid" in ''|*[!0-9]*) exit 1 ;; esac
  boot=$(cat /proc/sys/kernel/random/boot_id)
  previous=$(cat started/boot)
  if test "$boot" != "$previous" || ! kill -0 "$pid" 2>/dev/null; then state=failed; code=1; fi
elif test -f started/time; then
  started=$(cat started/time)
  case "$started" in ''|*[!0-9]*) exit 1 ;; esac
  now=$(date +%s)
  if test "$((now - started))" -gt 30; then state=failed; code=1; fi
else
  state=failed
  code=1
fi
printf '{"state":"%s","code":%s,"log":"' "$state" "$code"
if test -f events.log; then tail -c ${LOG_BYTES} events.log | base64 -w 0; fi
printf '"'
if test "$state" = done && test "$code" = 0; then
${artifactScript('policy.json')}${artifactScript('resume.json')}
fi
printf '}\\n'
`;
}

export function stopScript(descriptor) {
  return `set -eu\nmkdir -p ${remoteDirectory(descriptor.id)}\ncd ${remoteDirectory(descriptor.id)}\n: > stop\n`;
}
