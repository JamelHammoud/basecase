import { useEffect, useState } from 'react';
import { Button, Select, TextInput } from '../../design-system';
import type { NetworkRobot } from '../../robot/networkTypes';
import { NETWORK_ROBOT_MISMATCH, networkRobotAsk, networkRobotChoice } from '../../robot/networkRobot';
import { connectNetworkRobot, discoverRobots } from '../../robot/robotStore';
import type { ConnectChoice } from '../../robot/sceneRobot';
import { errorMessage } from '../../utils/errorMessage';

const keyOf = (robot: NetworkRobot) => robot.id ?? `${robot.host}:${robot.port}`;

export function NetworkRobotConnect({ choices }: { choices: ConnectChoice[] }) {
  const [robots, setRobots] = useState<NetworkRobot[]>([]);
  const [selected, setSelected] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const robot = robots.find((item) => keyOf(item) === selected) ?? robots[0];
  const choice = robot ? networkRobotChoice(robot, choices) : undefined;
  const refusal = choice ? message : NETWORK_ROBOT_MISMATCH;

  useEffect(() => {
    let active = true;
    const find = () => {
      void discoverRobots().then(
        (found) => active && setRobots(found),
        (error: unknown) => active && setMessage(errorMessage(error)),
      );
    };

    find();
    window.addEventListener('focus', find);

    return () => {
      active = false;
      window.removeEventListener('focus', find);
    };
  }, []);

  const connect = async () => {
    if (!robot || !choice || busy) return;

    setBusy(true);

    try {
      const reply = await connectNetworkRobot(networkRobotAsk(robot, code), choice.joints, choice.spec);

      setMessage(reply.ok ? null : reply.message);

      if (reply.ok) setCode('');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!robot) return null;

  return (
    <div className="mb-3 flex flex-col gap-2" data-testid="network-robot">
      <Select
        aria-label="Robot"
        value={keyOf(robot)}
        options={robots.map((item) => ({ value: keyOf(item), label: item.name }))}
        onChange={(event) => setSelected(event.target.value)}
        disabled={busy}
      />
      <TextInput
        aria-label="Pairing code"
        placeholder="482619"
        value={code}
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        disabled={busy}
      />
      <Button
        variant="primary"
        fullWidth
        disabled={!choice || busy || (code.length > 0 && code.length !== 6)}
        onClick={() => void connect()}
      >
        {busy ? 'Connecting…' : 'Connect Robot'}
      </Button>
      {refusal && (
        <p role="status" className="px-1 text-[12.5px] text-red-400">
          {refusal}
        </p>
      )}
    </div>
  );
}
