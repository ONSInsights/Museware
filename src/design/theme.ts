import { useEffect, useState } from 'react';
import { useUi } from '../store/useUi';
import { useProject } from '../store/useProject';
import { projectAppearance } from './projectAppearance';

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useResolvedCanvasTheme(themeMode?: unknown): 'light' | 'dark' {
  const preview = useUi((s) => s.projectPreview);
  const epoch = useProject((s) => s.documentEpoch);
  const theme =
    preview.epoch === epoch && preview.mode !== 'project'
      ? preview.mode
      : projectAppearance(themeMode);
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return theme === 'auto' ? system : theme;
}

export function useDarkChrome(): boolean {
  const theme = useUi((s) => s.theme);
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return (theme === 'auto' ? system : theme) === 'dark';
}
