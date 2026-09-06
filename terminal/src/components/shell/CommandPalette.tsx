'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { commandsFor, filterCommands, timeframeHref, type TerminalCommand } from '@/lib/commands';

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const results = filterCommands(commandsFor(pathname), query);
  const selected = Math.min(index, Math.max(0, results.length - 1));

  const open = () => {
    if (dialog.current?.open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    input.current?.focus();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      const target = event.target as HTMLElement;
      const editing = target.isContentEditable || !!target.closest('input, textarea, select');
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') ||
          (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.getElementById(`iris-command-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, query]);

  const run = (command: TerminalCommand) => {
    dialog.current?.close();
    router.push('href' in command ? command.href : timeframeHref(pathname, window.location.search, command.timeframe));
  };

  return <>
    <div className="iris-command-bar">
      <button type="button" onClick={open} aria-haspopup="dialog">⌕ Commands <kbd>Ctrl/⌘ K</kbd></button>
      <span>Navigate sections · change timeframe</span>
    </div>
    <dialog ref={dialog} className="iris-command-dialog" aria-labelledby="iris-command-title"
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      onClose={() => { setQuery(''); setIndex(0); returnFocus.current?.focus(); }}>
      <div className="iris-command-content">
        <div className="iris-command-heading"><strong id="iris-command-title">IRIS COMMANDS</strong>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close commands">ESC ×</button></div>
        <input ref={input} aria-label="Search commands" placeholder="Try monthly, sentiment, or timeframe 7D…"
          role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="iris-command-results"
          aria-activedescendant={results.length ? `iris-command-${selected}` : undefined}
          value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (results.length) setIndex((selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (results[selected]) run(results[selected]);
            }
          }} />
        <div id="iris-command-results" role="listbox" aria-label="Commands" className="iris-command-results">
          {results.map((command, i) => <button type="button" role="option" aria-selected={i === selected}
            id={`iris-command-${i}`} key={command.id} tabIndex={-1} onClick={() => run(command)}>
            <span>{command.label}</span><span aria-hidden="true">↵</span>
          </button>)}
        </div>
        {!results.length && <p role="status">No matching commands.</p>}
        <footer>↑ ↓ Select · Enter Open · Esc Close · / Search</footer>
      </div>
    </dialog>
  </>;
}
