"""Conservative as-of join for observation-stamped free-data snapshots.

A historical vendor period is not itself a data-availability timestamp.
This helper never treats retrospectively downloaded history as live history.
"""
from datetime import datetime, timedelta, time, timezone, date
from decimal import Decimal, InvalidOperation
from typing import Iterable, Mapping


def utc_time(value: str | datetime) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
    except (ValueError, AttributeError) as exc:
        raise ValueError('Invalid as-of timestamp') from exc
    if not isinstance(parsed, datetime) or parsed.tzinfo is None:
        raise ValueError('As-of timestamps must be timezone-aware')
    return parsed.astimezone(timezone.utc)


def value_at_origin(rows: Iterable[Mapping], metric: str, origin: str | datetime,
                    *, max_age_days: int = 2) -> dict:
    """Select latest actually observed, fully completed daily metric.

    Age is measured since the end of the reported UTC measurement day; this
    does not assume provider-specific release latency. A metric may be known
    yet too stale to satisfy the caller's chosen freshness budget.
    """
    now = utc_time(origin)
    if not isinstance(max_age_days, int) or not 0 <= max_age_days <= 365:
        raise ValueError('max_age_days must be 0..365')
    chosen = None
    for row in rows:
        if row.get('metric') != metric or row.get('state') != 'observed':
            continue
        if row.get('value') is None or row.get('value') == '':
            continue
        try:
            measurement_date = date.fromisoformat(row['date'])
            end_of_day = datetime.combine(measurement_date + timedelta(days=1), time(), timezone.utc)
            first_seen = utc_time(row['observed_at'])
            number = Decimal(str(row['value']))
        except (KeyError, TypeError, InvalidOperation, ValueError) as exc:
            raise ValueError('Invalid point-in-time observation') from exc
        if not number.is_finite():
            raise ValueError('Nonfinite point-in-time value')
        # Only completed measurements observed before the forecast origin.
        if first_seen > now or end_of_day > now:
            continue
        if chosen is None or (end_of_day, first_seen) > (chosen[0], chosen[1]):
            chosen = (end_of_day, first_seen, str(row['value']), measurement_date.isoformat())
    if chosen is None:
        return {'metric': metric, 'value': None, 'available': False, 'reason': 'not_observed_at_origin',
                'measurement_date': None, 'first_seen_at': None, 'age_hours': None}
    end, first_seen, value, measurement_date = chosen
    hours = (now - end).total_seconds() / 3600
    if now - end > timedelta(days=max_age_days):
        return {'metric': metric, 'value': None, 'available': False, 'reason': 'stale',
                'measurement_date': measurement_date, 'first_seen_at': first_seen.isoformat(),
                'age_hours': round(hours, 3)}
    return {'metric': metric, 'value': value, 'available': True, 'reason': None,
            'measurement_date': measurement_date, 'first_seen_at': first_seen.isoformat(),
            'age_hours': round(hours, 3)}
