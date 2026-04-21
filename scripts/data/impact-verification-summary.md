# Impact Verification Summary

Generated 2026-04-21T23:03:18.466Z

## Counts

- **total**: 68
- **ok**: 34
- **mismatch**: 8
- **catalog_missing**: 0
- **live_missing**: 0
- **both_missing**: 26
- **fetch_failed**: 0

## Mismatches (8)

- **iFlex Pedestrian 3 Rail** — catalog 5800J → live 5800J. impactRating matches (5800 J). pas13Method differs: catalog=pendulum, live=vehicle (live page dominated by vehicle test spec).
- **eFlex Single Traffic Barrier+** — catalog 10168J → live 10168J. impactRating matches (10168 J). pas13Method differs: catalog=vehicle, live=pendulum (live page shows pendulum test video).
- **eFlex Single RackEnd+Kerb** — catalog 4000J → live 4000J. impactRating matches (4000 J). pas13Certified differs: catalog=true, live=false (no PAS 13 mention on live page per extraction).
- **iFlex Single RackEnd+Kerb** — catalog 15100J → live 15100J. impactRating matches (15100 J). pas13Certified differs: catalog=true, live=false (no PAS 13 mention on live page per extraction).
- **Coach Stop** — catalog nullJ → live nullJ. Joules null in both (both_missing for impact). heightMm agrees (115). Status set to 'mismatch' because catalog pas13Certified is null while live explicitly indicates no PAS 13 (false). Non-critical: product is low-level deterrent, not PAS 13 tested per live.
- **eFlex Double RackEnd+Kerb** — catalog 6000J → live 6000J. Impact energy (6,000 J / 3.7t / 6.4 kph / 90°) matches. However catalog claims PAS 13 certified; live extraction reports no PAS 13 badge visible. Worth verifying PAS 13 status.
- **eFlex Single RackEnd Barrier** — catalog 4000J → live 4000J. Impact rating matches 4,000J, vehicle test consistent. MISMATCH: catalog pas13Method='vehicle' but live page shows PAS13 pendulum test methodology. Suggest updating catalog to 'pendulum'.
- **iFlex Single RackEnd Barrier** — catalog 15100J → live 15100J. Impact rating matches 15,100J, vehicle test consistent. MISMATCH: catalog pas13Method='vehicle' but live page shows PAS13 pendulum test methodology. Suggest updating catalog to 'pendulum'.

## Catalog-missing (live has rating) (0)


## Fetch failures (0)
