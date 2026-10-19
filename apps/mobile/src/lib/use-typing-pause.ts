import { useEffect, useState } from 'react';

const typingPause = 300;

export function useTypingPause(text: string) {
  const [pausedText, setPausedText] = useState(text);

  useEffect(() => {
    const pause = setTimeout(() => setPausedText(text), typingPause);
    return () => clearTimeout(pause);
  }, [text]);

  return [pausedText, setPausedText] as const;
}
