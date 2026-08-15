import type React from 'react';
import { useEffect, useState } from 'react';

export type HelpStamp = {
  commandName: string;
  dataUri?: string;
};

type Props = {
  id: string;
  stamps: HelpStamp[];
  durationSeconds: number;
  onComplete: (id: string) => void;
};

export function CustomCommandHelp({
  id,
  stamps,
  durationSeconds,
  onComplete,
}: Props): React.JSX.Element | null {
  const [index, setIndex] = useState(0);
  const stamp = stamps[index];

  useEffect(() => {
    if (!stamp) {
      onComplete(id);
      return;
    }
    const timer = window.setTimeout(() => {
      if (index + 1 < stamps.length) setIndex((current) => current + 1);
      else onComplete(id);
    }, Math.max(durationSeconds, 1) * 1000);
    return () => window.clearTimeout(timer);
  }, [durationSeconds, id, index, onComplete, stamp, stamps.length]);

  if (!stamp) return null;
  return (
    <aside
      className="custom-command-help"
      key={`${id}-${index}`}
      style={{ animationDuration: `${Math.max(durationSeconds, 1)}s` }}
    >
      {stamp.dataUri && <img src={stamp.dataUri} alt="" />}
      <strong>{stamp.commandName}</strong>
    </aside>
  );
}
