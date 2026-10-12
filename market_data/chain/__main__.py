"""Explicit bounded Bitcoin block research. No scheduler or wallet operations."""
from __future__ import annotations
import argparse
import json
import sqlite3
from pathlib import Path

from .providers import Core, Esplora, Transport
from .store import DEFAULT_DB, scan, status, verify_store


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    ingest = commands.add_parser('scan')
    ingest.add_argument('--source', choices=['esplora', 'core'], default='esplora')
    ingest.add_argument('--start-height', type=int, required=True)
    ingest.add_argument('--end-height', type=int, required=True, help='Exclusive block height')
    ingest.add_argument('--max-blocks', type=int, default=8)
    ingest.add_argument('--max-requests', type=int, default=100)
    ingest.add_argument('--max-response-mib', type=int, default=64)
    ingest.add_argument('--max-prevout-txs', type=int, default=20)
    ingest.add_argument('--confirmations', type=int, default=6)
    ingest.add_argument('--max-reorg', type=int, default=12)
    ingest.add_argument('--rpc-url', default='http://127.0.0.1:8332')
    ingest.add_argument('--cookie', type=Path)
    for command in (ingest, commands.add_parser('status'), commands.add_parser('verify')):
        command.add_argument('--database', type=Path, default=DEFAULT_DB)
        command.add_argument('--report', type=Path)
    export = commands.add_parser('export')
    export.add_argument('--database', type=Path, default=DEFAULT_DB)
    export.add_argument('--output', type=Path, required=True)
    verify = commands.add_parser('verify-export')
    verify.add_argument('--artifact', type=Path, required=True)
    verify.add_argument('--database', type=Path)
    args = parser.parse_args(argv)
    report_path = getattr(args, 'report', None)
    if report_path and report_path.exists():
        parser.error('Report path already exists; choose a new path')
    try:
        if args.command == 'scan':
            if args.source == 'core' and args.cookie is None:
                parser.error('Local Core requires --cookie; never put RPC secrets in source control')
            transport = Transport(max_requests=args.max_requests, max_bytes=args.max_response_mib*1024*1024)
            try:
                source = (Core(transport,args.cookie,args.rpc_url) if args.source == 'core'
                          else Esplora(transport,args.max_prevout_txs))
                result = scan(source,args.database,start=args.start_height,end=args.end_height,
                              max_blocks=args.max_blocks,confirmations=args.confirmations,max_reorg=args.max_reorg)
            finally:
                transport.close()
        elif args.command == 'status':
            result = status(args.database)
        elif args.command == 'verify':
            result = verify_store(args.database)
        else:
            from .warehouse import export, verify
            result = export(args.database,args.output) if args.command == 'export' else verify(args.artifact,args.database)
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as exc:
        result = {'status':'failed','error':str(exc)[:300], 'model_ready':False}
        code = 1
    else:
        code = 0
    if report_path:
        report_path.parent.mkdir(parents=True,exist_ok=True)
        with report_path.open('x',encoding='utf-8') as handle:
            json.dump(result,handle,indent=2,allow_nan=False)
            handle.write('\n')
    print(json.dumps(result,indent=2,allow_nan=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
