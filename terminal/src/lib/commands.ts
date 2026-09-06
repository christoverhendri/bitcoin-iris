import { SECTIONS, subHref, TIMEFRAMES, type Timeframe } from './nav';

export type TerminalCommand = { id: string; label: string; href: string } |
  { id: string; label: string; timeframe: Timeframe };

export function commandsFor(pathname: string): TerminalCommand[] {
  const commands: TerminalCommand[] = SECTIONS.flatMap((section) => section.subs.map((sub) => ({
    id: subHref(section, sub), href: subHref(section, sub),
    label: `${section.label}${sub.slug ? ` / ${sub.label}` : ''}`,
  })));
  if (/^\/(overview|market)(\/|$)/.test(pathname)) {
    commands.push(...TIMEFRAMES.map((timeframe) => ({ id: `tf-${timeframe}`, label: `Timeframe ${timeframe}`, timeframe })));
  }
  return commands;
}

export function filterCommands(commands: TerminalCommand[], query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.filter((command) => words.every((word) => command.label.toLowerCase().includes(word)));
}

export function timeframeHref(pathname: string, search: string, timeframe: Timeframe) {
  const params = new URLSearchParams(search);
  params.set('tf', timeframe);
  return `${pathname}?${params}`;
}
