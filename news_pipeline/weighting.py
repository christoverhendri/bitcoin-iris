"""Bounded ranking heuristic, not a learned impact or credibility probability."""
import math
from datetime import datetime

VERSION = 'iris-post-weight/1.0.0'


def weight_post(parsed, published_at, as_of, duplicate=False):
    if as_of.tzinfo is None:
        raise ValueError('as_of must have a timezone')
    relevance = 1.0 if parsed['btc_relevance'] == 'explicit_mention' else 0.3
    evidence = 1.0 if parsed['events'] else 0.5
    certainty = 0.5 if parsed['needs_review'] else 1.0
    timestamp_quality = 1.0 if published_at else 0.5
    age_hours = None
    freshness = 1.0
    if published_at:
        date = datetime.fromisoformat(published_at)
        if date.tzinfo is None:
            raise ValueError('published_at must have a timezone')
        age_hours = (as_of - date).total_seconds() / 3600
        freshness = 0.0 if age_hours < 0 else math.exp2(-age_hours / 24)
    novelty = 0.0 if duplicate else 1.0
    factors = dict(relevance=relevance, evidence=evidence, certainty=certainty,
                   timestamp_quality=timestamp_quality, freshness=freshness, novelty=novelty)
    return {'version': VERSION, 'post_weight': round(math.prod(factors.values()), 8),
            'factors': factors, 'age_hours': age_hours, 'as_of': as_of.isoformat(),
            'basis': 'uncalibrated_ranking_heuristic', 'half_life_hours': 24}
