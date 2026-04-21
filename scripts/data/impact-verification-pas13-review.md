# PAS 13 Metadata Review Queue

Generated 2026-04-21T23:03:18.465Z

These drifts were NOT auto-applied. Live extractor may have picked the most-visible test video from the page while the catalog captured the canonical test method. Reconcile against the official technical sheets before updating the DB.

Total: 20


### iFlex Pedestrian 3 Rail
- https://www.asafe.com/ar-ae/products/iflex-pedestrian-3-rail/
- pas13Method: catalog=`pendulum` vs live=`vehicle`
- pas13Certified: catalog=`true` vs live=`true`
- notes: impactRating matches (5800 J). pas13Method differs: catalog=pendulum, live=vehicle (live page dominated by vehicle test spec).

### eFlex Single Traffic Barrier+
- https://www.asafe.com/ar-ae/products/eflex-single-traffic-barrierplus/
- pas13Method: catalog=`vehicle` vs live=`pendulum`
- pas13Certified: catalog=`true` vs live=`true`
- notes: impactRating matches (10168 J). pas13Method differs: catalog=vehicle, live=pendulum (live page shows pendulum test video).

### eFlex Single RackEnd+Kerb
- https://www.asafe.com/ar-ae/products/eflex-single-rackendpluskerb/
- pas13Method: catalog=`vehicle` vs live=`null`
- pas13Certified: catalog=`true` vs live=`false`
- notes: impactRating matches (4000 J). pas13Certified differs: catalog=true, live=false (no PAS 13 mention on live page per extraction).

### iFlex Single RackEnd+Kerb
- https://www.asafe.com/ar-ae/products/iflex-single-rackendpluskerb/
- pas13Method: catalog=`vehicle` vs live=`null`
- pas13Certified: catalog=`true` vs live=`false`
- notes: impactRating matches (15100 J). pas13Certified differs: catalog=true, live=false (no PAS 13 mention on live page per extraction).

### Pedestrian Barrier 190-T2-P1
- https://www.asafe.com/ar-ae/products/pedestrian-barrier-190-t2-p1/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: Neither catalog nor live page publishes an explicit Joules impact rating. Live reports no PAS 13 badge (false) vs catalog's null; live extracted heightMm=1900 from the model designation.

### Under Guard
- https://www.asafe.com/ar-ae/products/under-guard/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: No impact rating data published on live page.

### Coach Stop
- https://www.asafe.com/ar-ae/products/coach-stop/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: Joules null in both (both_missing for impact). heightMm agrees (115). Status set to 'mismatch' because catalog pas13Certified is null while live explicitly indicates no PAS 13 (false). Non-critical: product is low-level deterrent, not PAS 13 tested per live.

### Traffic Barrier 190-T1-P0
- https://www.asafe.com/ar-ae/products/traffic-barrier-190-t1-p0/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: New-generation barrier - neither source states Joule rating or vehicle test. Live page does not display a PAS 13 badge.

### Bollard 130
- https://www.asafe.com/ar-ae/products/bollard-130/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`true` vs live=`false`
- notes: No impact data on either side. Catalog asserts PAS 13 true; live extractor could not confirm badge. Joule value both missing - consider pas13 flag follow-up.

### RackGuard Cold Storage
- https://www.asafe.com/ar-ae/products/rackguard-cold-storage/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: No impact data on either side. Live page lists available heights 400mm/600mm but no impact rating.

### eFlex Double RackEnd+Kerb
- https://www.asafe.com/ar-ae/products/eflex-double-rackendpluskerb/
- pas13Method: catalog=`vehicle` vs live=`null`
- pas13Certified: catalog=`true` vs live=`false`
- notes: Impact energy (6,000 J / 3.7t / 6.4 kph / 90°) matches. However catalog claims PAS 13 certified; live extraction reports no PAS 13 badge visible. Worth verifying PAS 13 status.

### RackEye
- https://www.asafe.com/ar-ae/products/rackeye/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: IoT monitoring device - not an impact-rated product. Both sources correctly omit impact ratings.

### Car Stop
- https://www.asafe.com/ar-ae/products/car-stop/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: Rubber wheel stop - not impact-rated. Both correctly omit.

### Pedestrian Barrier 130-T0-P3
- https://www.asafe.com/ar-ae/products/pedestrian-barrier-130-t0-p3/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: Neither catalog nor live page provide explicit impact rating. Live page height 130mm appears inferred from model number. PAS13 unclear on both sides (catalog null, live false).

### Traffic Barrier 190-T2-P0
- https://www.asafe.com/ar-ae/products/traffic-barrier-190-t2-p0/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: Neither source provides explicit impact rating. Page provides impact height range 205-745mm only.

### eFlex Single RackEnd Barrier
- https://www.asafe.com/ar-ae/products/eflex-single-rackend-barrier/
- pas13Method: catalog=`vehicle` vs live=`pendulum`
- pas13Certified: catalog=`true` vs live=`true`
- notes: Impact rating matches 4,000J, vehicle test consistent. MISMATCH: catalog pas13Method='vehicle' but live page shows PAS13 pendulum test methodology. Suggest updating catalog to 'pendulum'.

### iFlex Single RackEnd Barrier
- https://www.asafe.com/ar-ae/products/iflex-single-rackend-barrier/
- pas13Method: catalog=`vehicle` vs live=`pendulum`
- pas13Certified: catalog=`true` vs live=`true`
- notes: Impact rating matches 15,100J, vehicle test consistent. MISMATCH: catalog pas13Method='vehicle' but live page shows PAS13 pendulum test methodology. Suggest updating catalog to 'pendulum'.

### Dock Buffer
- https://www.asafe.com/ar-ae/products/dock-buffer/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: No impact rating on either side. Catalog has pas13.certified=null, live states no PAS13 info on page.

### Retractable Barrier
- https://www.asafe.com/ar-ae/products/retractable-barrier/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: No impact rating on either side. Product is access control tape-webbing, impact rating not expected.

### Sign Post
- https://www.asafe.com/ar-ae/products/sign-post/
- pas13Method: catalog=`null` vs live=`null`
- pas13Certified: catalog=`null` vs live=`false`
- notes: No impact rating on either side. Product is signage post, impact rating not expected.