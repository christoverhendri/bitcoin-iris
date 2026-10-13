"""IRIS path-memory experiment CLI. No network calls, trading or live promotion."""
from __future__ import annotations

import argparse
import csv
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys

import numpy as np

from . import SCHEMA
from .data import digest_file, read_sqlite, read_warehouse, utc_seconds
from .features import build_examples, VARIANTS
from .model import Protocol, evaluate, calibrated, ridge_predict

MAX_ARTIFACT_BYTES = 128 * 1024 * 1024


def json_read(path: Path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 8*1024*1024:
        raise ValueError('Expected a bounded regular JSON artifact')
    return json.loads(path.read_text(), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n', encoding='utf-8')


def code_hash():
    h = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob('*.py')):
        h.update(path.name.encode() + b'\0' + path.read_bytes())
    return h.hexdigest()


def run_experiment(data, output, *, cutoff: int, horizons=(1, 7, 30), protocol=None,
                   allow_retrospective=False):
    if not allow_retrospective:
        raise ValueError('Explicit --allow-retrospective is required; these are not source-vintage forecasts')
    protocol = protocol or Protocol()
    protocol.validate()
    if not horizons or len(horizons) > 3 or len(set(horizons)) != len(horizons):
        raise ValueError('Use distinct horizons from 1,7,30')
    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive reservation: never replace a caller-owned directory.
    out.mkdir(exist_ok=False)
    try:
        results, all_predictions, fitted = [], [], {}
        for horizon in horizons:
            ds = build_examples(data, horizon=horizon, cutoff=cutoff, seed=protocol.seed)
            report, predictions, models = evaluate(ds, protocol)
            results.append(report)
            all_predictions.extend(predictions)
            fitted[str(horizon)] = models
        summary = {'schema_version': SCHEMA, 'status': 'research_only', 'model_ready': False,
                   'historical_backtest_safe': False,
                   'information_mode': 'retrospective_reconstruction',
                   'generated_at': datetime.now(timezone.utc).isoformat(),
                   'source': data.provenance, 'code_sha256': code_hash(),
                   'protocol': asdict(protocol), 'experiments': results,
                   'warnings': [
                       'Previously explored historical archive; not a confirmatory holdout.',
                       'No event or global UTXO predictors are fitted in this version.',
                       'Residual bands are empirical; no conditional coverage guarantee.',
                       'One seeded shuffled-order control is a diagnostic, not a permutation p-value.',
                       'Bootstrap intervals are exploratory and not multiple-testing adjusted.',
                       'Coverage exclusions apply equally to every candidate within a horizon.',
                       'Future RV is hourly-derived daily variation, not tick-level latent variance.',
                       'Adverse excursion is monitored at hourly closes, not at intrahour lows.']}
        write_json(out / 'summary.json', summary)
        write_json(out / 'models.json', {'schema_version': SCHEMA, 'model_ready': False,
                                       'source': data.provenance, 'models': fitted})
        with (out / 'predictions.csv').open('x', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(all_predictions[0]))
            writer.writeheader()
            writer.writerows(all_predictions)
        files = {name: {'sha256': digest_file(out / name), 'bytes': (out / name).stat().st_size}
                 for name in ('summary.json', 'models.json', 'predictions.csv')}
        if sum(f['bytes'] for f in files.values()) > MAX_ARTIFACT_BYTES:
            raise ValueError('Research artifact exceeds 128 MiB')
        # Manifest last: incomplete runs are not readable as completed results.
        write_json(out / 'manifest.json', {'schema_version': SCHEMA, 'status': 'research_only',
                                          'model_ready': False, 'files': files,
                                          'code_sha256': summary['code_sha256']})
        return summary
    except Exception:
        shutil.rmtree(out)
        raise


def verify_artifact(folder):
    p = Path(folder)
    manifest = json_read(p / 'manifest.json')
    if (manifest.get('schema_version') != SCHEMA or manifest.get('status') != 'research_only'
            or manifest.get('model_ready') is not False
            or set(manifest.get('files', {})) != {'summary.json', 'models.json', 'predictions.csv'}):
        raise ValueError('Not a complete, research-only market-memory artifact')
    total = 0
    for name, record in manifest['files'].items():
        f = p / name
        if (f.is_symlink() or not f.is_file() or f.stat().st_size != record['bytes']
                or record['bytes'] > MAX_ARTIFACT_BYTES or digest_file(f) != record['sha256']):
            raise ValueError('Research artifact size/hash mismatch')
        total += f.stat().st_size
    if total > MAX_ARTIFACT_BYTES:
        raise ValueError('Research artifact budget exceeded')
    report, models = json_read(p / 'summary.json'), json_read(p / 'models.json')
    for obj in (report, models):
        if obj.get('schema_version') != SCHEMA or obj.get('model_ready') is not False:
            raise ValueError('Incompatible or promoted research artifact')
    if report.get('historical_backtest_safe') is not False or report.get('information_mode') != 'retrospective_reconstruction':
        raise ValueError('Misleading historical-vintage claim')
    if report['code_sha256'] != manifest['code_sha256']:
        raise ValueError('Code provenance mismatch')
    return report, models


def predict(data, artifact, *, cutoff, horizon, variant, allow_retrospective=False):
    if not allow_retrospective:
        raise ValueError('Explicit retrospective acknowledgement required')
    report, saved = verify_artifact(artifact)
    if variant not in VARIANTS or str(horizon) not in saved['models']:
        raise ValueError('Unknown saved variant or horizon')
    if saved['source']['source'] != data.provenance['source'] or saved['source']['instrument'] != data.provenance['instrument']:
        raise ValueError('Model and source identities differ')
    ds = build_examples(data, horizon=horizon, cutoff=cutoff, seed=report['protocol']['seed'])
    if ds.latest is None:
        raise ValueError('No complete eligible latest feature window')
    model = saved['models'][str(horizon)][variant]
    if utc_seconds(model['calibration_last_label_end']) >= utc_seconds(ds.latest['origin']):
        raise ValueError('Prediction origin precedes the fitted/calibrated information boundary')
    if tuple(model['features']) != VARIANTS[variant]:
        raise ValueError('Incompatible feature ordering')
    x = np.array([[ds.latest['values'][f] for f in model['features']]])
    q, lm = calibrated(model, ridge_predict(model['regression'], x))
    return {'schema_version': SCHEMA, 'status': 'research_only', 'model_ready': False,
            'historical_backtest_safe': False, 'variant': variant, 'horizon_days': horizon,
            'origin': ds.latest['origin'], 'source_observed_at': ds.latest['source_observed_at'],
            'information_mode': 'retrospective_reconstruction',
            'source_sha256': data.provenance['effective_sha256'],
            'mean_daily_rv_estimate': float(np.exp(lm[0])),
            'rv_quantiles': np.exp(q[0, 0]).tolist(),
            'log_return_quantiles': q[0, 1].tolist(),
            'hourly_adverse_excursion_quantiles': (np.maximum(0, np.expm1(q[0, 2]))/100).tolist(),
            'quantile_levels': [.05, .5, .95],
            'warning': 'Saved research candidate only; no live forecast promotion or coverage guarantee.'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('run', 'inspect', 'predict'):
        p = sub.add_parser(command)
        source = p.add_mutually_exclusive_group(required=True)
        source.add_argument('--database', type=Path)
        source.add_argument('--warehouse', type=Path)
        p.add_argument('--as-of', required=True, help='Completed-bar analysis cutoff, not provider vintage')
        p.add_argument('--allow-retrospective', action='store_true')
        if command == 'run':
            p.add_argument('--output', type=Path, required=True)
            p.add_argument('--horizons', default='1,7,30')
            p.add_argument('--seed', type=int, default=42)
            p.add_argument('--bootstrap-reps', type=int, default=200)
        else:
            p.add_argument('--horizon', type=int, choices=(1, 7, 30), default=7)
        if command == 'predict':
            p.add_argument('--artifact', type=Path, required=True)
            p.add_argument('--variant', choices=tuple(VARIANTS), default='B2')
    v = sub.add_parser('verify')
    v.add_argument('--artifact', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'verify':
            report, _ = verify_artifact(args.artifact)
            result = {'verified': True, 'status': 'research_only', 'model_ready': False,
                      'code_matches_installed': report['code_sha256'] == code_hash()}
        else:
            cutoff = utc_seconds(args.as_of)
            if cutoff > int(datetime.now(timezone.utc).timestamp()):
                raise ValueError('Analysis cutoff is in the future')
            data = read_sqlite(args.database) if args.database else read_warehouse(args.warehouse)
            if args.command == 'inspect':
                ds = build_examples(data, horizon=args.horizon, cutoff=cutoff)
                result = {'source': data.provenance, 'coverage': ds.coverage,
                          'feature_counts': {k: len(v) for k, v in VARIANTS.items()},
                          'latest': ds.latest, 'model_ready': False}
            elif args.command == 'run':
                p = Protocol(seed=args.seed, bootstrap_reps=args.bootstrap_reps)
                result = run_experiment(data, args.output, cutoff=cutoff,
                    horizons=tuple(int(h) for h in args.horizons.split(',')), protocol=p,
                    allow_retrospective=args.allow_retrospective)
                result = {'output': str(args.output), 'status': result['status'],
                          'results': [r for e in result['experiments'] for r in e['summary']]}
            else:
                result = predict(data, args.artifact, cutoff=cutoff, horizon=args.horizon,
                                 variant=args.variant, allow_retrospective=args.allow_retrospective)
        print(json.dumps(result, indent=2, allow_nan=False))
        return 0
    except (ValueError, OSError, KeyError, sqlite3.Error, ImportError) as exc:
        print(json.dumps({'error': str(exc), 'model_ready': False}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
