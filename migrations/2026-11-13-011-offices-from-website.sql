-- global_offices from asafe.com (2026-11-13).
-- GENERATED from shared/offices.ts by scripts/buildOfficesMigration.ts. Do not edit by hand:
-- shared/officesMigration.test.ts fails if this file and the office records differ.
--
-- The app had invented contact emails for most countries, friendly names in place of
-- the legal entities, addresses without their diacritics and no map positions. Every
-- value below is what the contact pages of https://www.asafe.com publish.
--
-- 17 UPDATEs target the existing rows by id. Each is guarded, so a re-run that finds
-- the row already correct changes nothing. 3 INSERTs add the offices the website lists
-- that the app did not have, and do nothing when the id is already present.

-- United Kingdom: A-SAFE UK Ltd, Habergham Works, Ainleys Industrial Estate, Elland, Halifax, HX5 9JP.
UPDATE global_offices
SET company_name = 'A-SAFE UK Ltd',
    region = 'Europe',
    country = 'United Kingdom',
    city = 'Halifax',
    address_line1 = 'Habergham Works',
    address_line2 = 'Ainleys Industrial Estate',
    address_line3 = 'Elland',
    postal_code = 'HX5 9JP',
    phone = '+44 (0)1422 331133',
    email = 'sales@asafe.co.uk',
    google_maps_url = NULL,
    latitude = 53.67755740,
    longitude = -1.83392260,
    is_default = true,
    sort_order = 1,
    updated_at = now()
WHERE id = '98306d62-bf0c-4f8b-9e49-5bfcd3f14f9d'
  AND (company_name IS DISTINCT FROM 'A-SAFE UK Ltd'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'United Kingdom'
    OR city IS DISTINCT FROM 'Halifax'
    OR address_line1 IS DISTINCT FROM 'Habergham Works'
    OR address_line2 IS DISTINCT FROM 'Ainleys Industrial Estate'
    OR address_line3 IS DISTINCT FROM 'Elland'
    OR postal_code IS DISTINCT FROM 'HX5 9JP'
    OR phone IS DISTINCT FROM '+44 (0)1422 331133'
    OR email IS DISTINCT FROM 'sales@asafe.co.uk'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 53.67755740
    OR longitude IS DISTINCT FROM -1.83392260
    OR is_default IS DISTINCT FROM true
    OR sort_order IS DISTINCT FROM 1);

-- Belgium: A-SAFE bvba, Krommebeekstraat 56A, 8930 Menen.
-- The website pin is not at this address. It is stored as published and map links use the address.
UPDATE global_offices
SET company_name = 'A-SAFE bvba',
    region = 'Europe',
    country = 'Belgium',
    city = 'Menen',
    address_line1 = 'Krommebeekstraat 56A',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '8930',
    phone = '+32 (0)5143 3434',
    email = 'customer.service@asafe.be',
    google_maps_url = NULL,
    latitude = 50.94242900,
    longitude = 3.14236200,
    is_default = false,
    sort_order = 3,
    updated_at = now()
WHERE id = 'fac63ff1-29a9-424a-8e19-43b69bc244c7'
  AND (company_name IS DISTINCT FROM 'A-SAFE bvba'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Belgium'
    OR city IS DISTINCT FROM 'Menen'
    OR address_line1 IS DISTINCT FROM 'Krommebeekstraat 56A'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '8930'
    OR phone IS DISTINCT FROM '+32 (0)5143 3434'
    OR email IS DISTINCT FROM 'customer.service@asafe.be'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 50.94242900
    OR longitude IS DISTINCT FROM 3.14236200
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 3);

-- Denmark: A-SAFE ApS, Rugvænget 46A, 2630 Taastrup.
UPDATE global_offices
SET company_name = 'A-SAFE ApS',
    region = 'Europe',
    country = 'Denmark',
    city = 'Taastrup',
    address_line1 = 'Rugvænget 46A',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '2630',
    phone = '+45 35145 026',
    email = 'info@asafe.dk',
    google_maps_url = NULL,
    latitude = 55.65000000,
    longitude = 12.28655600,
    is_default = false,
    sort_order = 4,
    updated_at = now()
WHERE id = '4ef0d760-e0e2-490b-8d89-b705806b1658'
  AND (company_name IS DISTINCT FROM 'A-SAFE ApS'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Denmark'
    OR city IS DISTINCT FROM 'Taastrup'
    OR address_line1 IS DISTINCT FROM 'Rugvænget 46A'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '2630'
    OR phone IS DISTINCT FROM '+45 35145 026'
    OR email IS DISTINCT FROM 'info@asafe.dk'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 55.65000000
    OR longitude IS DISTINCT FROM 12.28655600
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 4);

-- France: A-SAFE SAS, 16 Avenue Christian Doppler - Bat. C, 77700 Bailly-Romainvilliers.
UPDATE global_offices
SET company_name = 'A-SAFE SAS',
    region = 'Europe',
    country = 'France',
    city = 'Bailly-Romainvilliers',
    address_line1 = '16 Avenue Christian Doppler - Bat. C',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '77700',
    phone = '+33 1 61 10 78 00',
    email = 'ventes@asafe.fr',
    google_maps_url = NULL,
    latitude = 48.84322700,
    longitude = 2.79845000,
    is_default = false,
    sort_order = 5,
    updated_at = now()
WHERE id = '1830de4e-82e8-4d2a-9f4e-39cc654f0e97'
  AND (company_name IS DISTINCT FROM 'A-SAFE SAS'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'France'
    OR city IS DISTINCT FROM 'Bailly-Romainvilliers'
    OR address_line1 IS DISTINCT FROM '16 Avenue Christian Doppler - Bat. C'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '77700'
    OR phone IS DISTINCT FROM '+33 1 61 10 78 00'
    OR email IS DISTINCT FROM 'ventes@asafe.fr'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 48.84322700
    OR longitude IS DISTINCT FROM 2.79845000
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 5);

-- Germany: A-SAFE GmbH, Sitzkrüger Moor 6, 23879 Mölln.
UPDATE global_offices
SET company_name = 'A-SAFE GmbH',
    region = 'Europe',
    country = 'Germany',
    city = 'Mölln',
    address_line1 = 'Sitzkrüger Moor 6',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '23879',
    phone = '+49 4542 995 80 40',
    email = 'vertrieb@asafe.de',
    google_maps_url = NULL,
    latitude = 53.64047000,
    longitude = 10.69596700,
    is_default = false,
    sort_order = 6,
    updated_at = now()
WHERE id = '40621b01-6f1d-49d3-bd6f-e72efeeb6dd9'
  AND (company_name IS DISTINCT FROM 'A-SAFE GmbH'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Germany'
    OR city IS DISTINCT FROM 'Mölln'
    OR address_line1 IS DISTINCT FROM 'Sitzkrüger Moor 6'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '23879'
    OR phone IS DISTINCT FROM '+49 4542 995 80 40'
    OR email IS DISTINCT FROM 'vertrieb@asafe.de'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 53.64047000
    OR longitude IS DISTINCT FROM 10.69596700
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 6);

-- Italy: A-SAFE Italia s.r.l., Via Felice Matteucci, 19, 20862 Arcore MB.
-- The website pin is not at this address. It is stored as published and map links use the address.
UPDATE global_offices
SET company_name = 'A-SAFE Italia s.r.l.',
    region = 'Europe',
    country = 'Italy',
    city = 'Arcore',
    address_line1 = 'Via Felice Matteucci, 19',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '20862',
    phone = '+39 039 2268044',
    email = 'commerciale@asafe.it',
    google_maps_url = NULL,
    latitude = 45.63314400,
    longitude = 9.34010100,
    is_default = false,
    sort_order = 7,
    updated_at = now()
WHERE id = 'ea67fb0c-5a33-4c02-b6ea-535c5849a28f'
  AND (company_name IS DISTINCT FROM 'A-SAFE Italia s.r.l.'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Italy'
    OR city IS DISTINCT FROM 'Arcore'
    OR address_line1 IS DISTINCT FROM 'Via Felice Matteucci, 19'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '20862'
    OR phone IS DISTINCT FROM '+39 039 2268044'
    OR email IS DISTINCT FROM 'commerciale@asafe.it'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 45.63314400
    OR longitude IS DISTINCT FROM 9.34010100
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 7);

-- Netherlands: A-SAFE B.V., Honderdland 150, 2676 LT Maasdijk.
UPDATE global_offices
SET company_name = 'A-SAFE B.V.',
    region = 'Europe',
    country = 'Netherlands',
    city = 'Maasdijk',
    address_line1 = 'Honderdland 150',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = '2676 LT',
    phone = '+31 (0)1746 13120',
    email = 'info@asafe.nl',
    google_maps_url = NULL,
    latitude = 51.95931100,
    longitude = 4.21442700,
    is_default = false,
    sort_order = 8,
    updated_at = now()
WHERE id = '6eb556aa-208a-4fec-bfdb-95e5dbb114a9'
  AND (company_name IS DISTINCT FROM 'A-SAFE B.V.'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Netherlands'
    OR city IS DISTINCT FROM 'Maasdijk'
    OR address_line1 IS DISTINCT FROM 'Honderdland 150'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '2676 LT'
    OR phone IS DISTINCT FROM '+31 (0)1746 13120'
    OR email IS DISTINCT FROM 'info@asafe.nl'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 51.95931100
    OR longitude IS DISTINCT FROM 4.21442700
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 8);

-- Poland: A-SAFE Sp. z o.o., Budynek Spaces Platinum (5 piętro), ul. Domaniewska 44, 02-672 Warszawa.
-- The website pin is not at this address. It is stored as published and map links use the address.
UPDATE global_offices
SET company_name = 'A-SAFE Sp. z o.o.',
    region = 'Europe',
    country = 'Poland',
    city = 'Warszawa',
    address_line1 = 'Budynek Spaces Platinum (5 piętro)',
    address_line2 = 'ul. Domaniewska 44',
    address_line3 = NULL,
    postal_code = '02-672',
    phone = '+48 61 250 35 35',
    email = 'polska@asafe.pl',
    google_maps_url = NULL,
    latitude = 52.13560000,
    longitude = 21.02040000,
    is_default = false,
    sort_order = 9,
    updated_at = now()
WHERE id = '1f444a10-a934-48f6-8e2f-72ba9c49ee86'
  AND (company_name IS DISTINCT FROM 'A-SAFE Sp. z o.o.'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Poland'
    OR city IS DISTINCT FROM 'Warszawa'
    OR address_line1 IS DISTINCT FROM 'Budynek Spaces Platinum (5 piętro)'
    OR address_line2 IS DISTINCT FROM 'ul. Domaniewska 44'
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '02-672'
    OR phone IS DISTINCT FROM '+48 61 250 35 35'
    OR email IS DISTINCT FROM 'polska@asafe.pl'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 52.13560000
    OR longitude IS DISTINCT FROM 21.02040000
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 9);

-- Spain: A-SAFE Soluciones S.L., C/ Botiguers 5, Edificio Manuel Borso, Bloque A, oficina 202, Parque Empresarial Táctica, 46980 Paterna, Valencia.
UPDATE global_offices
SET company_name = 'A-SAFE Soluciones S.L.',
    region = 'Europe',
    country = 'Spain',
    city = 'Paterna',
    address_line1 = 'C/ Botiguers 5, Edificio Manuel Borso',
    address_line2 = 'Bloque A, oficina 202',
    address_line3 = 'Parque Empresarial Táctica',
    postal_code = '46980',
    phone = '+34 (96) 111 70 94',
    email = 'ventas@asafe.es',
    google_maps_url = NULL,
    latitude = 39.51234078,
    longitude = -0.45028009,
    is_default = false,
    sort_order = 10,
    updated_at = now()
WHERE id = 'd065030d-f332-4bf7-90d1-ea7a5c074b51'
  AND (company_name IS DISTINCT FROM 'A-SAFE Soluciones S.L.'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Spain'
    OR city IS DISTINCT FROM 'Paterna'
    OR address_line1 IS DISTINCT FROM 'C/ Botiguers 5, Edificio Manuel Borso'
    OR address_line2 IS DISTINCT FROM 'Bloque A, oficina 202'
    OR address_line3 IS DISTINCT FROM 'Parque Empresarial Táctica'
    OR postal_code IS DISTINCT FROM '46980'
    OR phone IS DISTINCT FROM '+34 (96) 111 70 94'
    OR email IS DISTINCT FROM 'ventas@asafe.es'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 39.51234078
    OR longitude IS DISTINCT FROM -0.45028009
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 10);

-- Sweden: A-SAFE AB, Varlabergsvägen 29, SE-434 39 Kungsbacka.
UPDATE global_offices
SET company_name = 'A-SAFE AB',
    region = 'Europe',
    country = 'Sweden',
    city = 'Kungsbacka',
    address_line1 = 'Varlabergsvägen 29',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = 'SE-434 39',
    phone = '+46 300 77110',
    email = 'info@asafe.se',
    google_maps_url = NULL,
    latitude = 57.48988300,
    longitude = 12.05067000,
    is_default = false,
    sort_order = 11,
    updated_at = now()
WHERE id = '0a034388-981b-48cc-9e33-9eacdf0076f3'
  AND (company_name IS DISTINCT FROM 'A-SAFE AB'
    OR region IS DISTINCT FROM 'Europe'
    OR country IS DISTINCT FROM 'Sweden'
    OR city IS DISTINCT FROM 'Kungsbacka'
    OR address_line1 IS DISTINCT FROM 'Varlabergsvägen 29'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM 'SE-434 39'
    OR phone IS DISTINCT FROM '+46 300 77110'
    OR email IS DISTINCT FROM 'info@asafe.se'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 57.48988300
    OR longitude IS DISTINCT FROM 12.05067000
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 11);

-- United Arab Emirates: A-SAFE DWC-LLC, Office 220, Building A5, Dubai South Business Park, Dubai.
-- The website pin is not at this address. It is stored as published and map links use the address.
UPDATE global_offices
SET company_name = 'A-SAFE DWC-LLC',
    region = 'Middle East',
    country = 'United Arab Emirates',
    city = 'Dubai',
    address_line1 = 'Office 220, Building A5',
    address_line2 = 'Dubai South Business Park',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+971 (4) 8842 422',
    email = 'support@asafe.ae',
    google_maps_url = 'https://maps.app.goo.gl/55wf4FPkAe2NfKDHA',
    latitude = 25.25796100,
    longitude = 55.33653600,
    is_default = true,
    sort_order = 1,
    updated_at = now()
WHERE id = '8973dcb6-43f6-42a1-a176-65959b36df40'
  AND (company_name IS DISTINCT FROM 'A-SAFE DWC-LLC'
    OR region IS DISTINCT FROM 'Middle East'
    OR country IS DISTINCT FROM 'United Arab Emirates'
    OR city IS DISTINCT FROM 'Dubai'
    OR address_line1 IS DISTINCT FROM 'Office 220, Building A5'
    OR address_line2 IS DISTINCT FROM 'Dubai South Business Park'
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM NULL
    OR phone IS DISTINCT FROM '+971 (4) 8842 422'
    OR email IS DISTINCT FROM 'support@asafe.ae'
    OR google_maps_url IS DISTINCT FROM 'https://maps.app.goo.gl/55wf4FPkAe2NfKDHA'
    OR latitude IS DISTINCT FROM 25.25796100
    OR longitude IS DISTINCT FROM 55.33653600
    OR is_default IS DISTINCT FROM true
    OR sort_order IS DISTINCT FROM 1);

-- Saudi Arabia: A-SAFE FOR SAFETY COMPANY, Office 10, 6460 Ibrahim Ibn Mukhalad, Al Malaz District, Riyadh.
-- Also published: +966 53 035 6116 (no column, served from shared/offices.ts).
UPDATE global_offices
SET company_name = 'A-SAFE FOR SAFETY COMPANY',
    region = 'Middle East',
    country = 'Saudi Arabia',
    city = 'Riyadh',
    address_line1 = 'Office 10, 6460 Ibrahim Ibn Mukhalad',
    address_line2 = 'Al Malaz District',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+966 53 397 0866',
    email = 'support@asafe.sa',
    google_maps_url = NULL,
    latitude = 24.66886602,
    longitude = 46.72909491,
    is_default = false,
    sort_order = 2,
    updated_at = now()
WHERE id = '7344ce47-6829-4a3d-9cf3-7bbc26bfe399'
  AND (company_name IS DISTINCT FROM 'A-SAFE FOR SAFETY COMPANY'
    OR region IS DISTINCT FROM 'Middle East'
    OR country IS DISTINCT FROM 'Saudi Arabia'
    OR city IS DISTINCT FROM 'Riyadh'
    OR address_line1 IS DISTINCT FROM 'Office 10, 6460 Ibrahim Ibn Mukhalad'
    OR address_line2 IS DISTINCT FROM 'Al Malaz District'
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM NULL
    OR phone IS DISTINCT FROM '+966 53 397 0866'
    OR email IS DISTINCT FROM 'support@asafe.sa'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 24.66886602
    OR longitude IS DISTINCT FROM 46.72909491
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 2);

-- United States: A-SAFE Inc, 400 North Zarfoss Drive, York, PA 17404.
UPDATE global_offices
SET company_name = 'A-SAFE Inc',
    region = 'Americas',
    country = 'United States',
    city = 'York',
    address_line1 = '400 North Zarfoss Drive',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = 'PA 17404',
    phone = '(443) 776 3472',
    email = 'sales@asafe.us',
    google_maps_url = NULL,
    latitude = 39.94210300,
    longitude = -76.79591000,
    is_default = true,
    sort_order = 1,
    updated_at = now()
WHERE id = '9e2bed2e-763f-457f-a2c6-bdf3bb95a3e8'
  AND (company_name IS DISTINCT FROM 'A-SAFE Inc'
    OR region IS DISTINCT FROM 'Americas'
    OR country IS DISTINCT FROM 'United States'
    OR city IS DISTINCT FROM 'York'
    OR address_line1 IS DISTINCT FROM '400 North Zarfoss Drive'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM 'PA 17404'
    OR phone IS DISTINCT FROM '(443) 776 3472'
    OR email IS DISTINCT FROM 'sales@asafe.us'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 39.94210300
    OR longitude IS DISTINCT FROM -76.79591000
    OR is_default IS DISTINCT FROM true
    OR sort_order IS DISTINCT FROM 1);

-- Canada: A-SAFE Canada, A12-1250 South Service Rd., Stoney Creek, Ontario L8E 5R9.
UPDATE global_offices
SET company_name = 'A-SAFE Canada',
    region = 'Americas',
    country = 'Canada',
    city = 'Stoney Creek',
    address_line1 = 'A12-1250 South Service Rd.',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = 'Ontario L8E 5R9',
    phone = '+1 647.952.0030',
    email = 'sales@a-safe.ca',
    google_maps_url = NULL,
    latitude = 43.21870080,
    longitude = -79.64775440,
    is_default = false,
    sort_order = 3,
    updated_at = now()
WHERE id = 'b9329b0f-917b-4cf7-9b4c-c9660e0affc0'
  AND (company_name IS DISTINCT FROM 'A-SAFE Canada'
    OR region IS DISTINCT FROM 'Americas'
    OR country IS DISTINCT FROM 'Canada'
    OR city IS DISTINCT FROM 'Stoney Creek'
    OR address_line1 IS DISTINCT FROM 'A12-1250 South Service Rd.'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM 'Ontario L8E 5R9'
    OR phone IS DISTINCT FROM '+1 647.952.0030'
    OR email IS DISTINCT FROM 'sales@a-safe.ca'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 43.21870080
    OR longitude IS DISTINCT FROM -79.64775440
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 3);

-- Mexico: A-SAFE S.A. de C.V., Av. Industria Petroquimica, 435-F Parque Industrial, Queretaro, QRO 76220.
-- asafe.com lists no phone for this office: the existing number is kept, unverified.
UPDATE global_offices
SET company_name = 'A-SAFE S.A. de C.V.',
    region = 'Americas',
    country = 'Mexico',
    city = 'Queretaro',
    address_line1 = 'Av. Industria Petroquimica',
    address_line2 = '435-F Parque Industrial',
    address_line3 = NULL,
    postal_code = 'QRO 76220',
    phone = '+52 (442) 4788987',
    email = 'ventas@asafe.mx',
    google_maps_url = NULL,
    latitude = 20.74566700,
    longitude = -100.45510000,
    is_default = false,
    sort_order = 4,
    updated_at = now()
WHERE id = '01243519-bab1-410d-8728-8bfd74f94432'
  AND (company_name IS DISTINCT FROM 'A-SAFE S.A. de C.V.'
    OR region IS DISTINCT FROM 'Americas'
    OR country IS DISTINCT FROM 'Mexico'
    OR city IS DISTINCT FROM 'Queretaro'
    OR address_line1 IS DISTINCT FROM 'Av. Industria Petroquimica'
    OR address_line2 IS DISTINCT FROM '435-F Parque Industrial'
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM 'QRO 76220'
    OR phone IS DISTINCT FROM '+52 (442) 4788987'
    OR email IS DISTINCT FROM 'ventas@asafe.mx'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 20.74566700
    OR longitude IS DISTINCT FROM -100.45510000
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 4);

-- Australia: A-SAFE Australasia PTY Ltd, Unit 2, 1-5 Interchange Drive, Eastern Creek, NSW 2766.
UPDATE global_offices
SET company_name = 'A-SAFE Australasia PTY Ltd',
    region = 'Asia Pacific',
    country = 'Australia',
    city = 'Eastern Creek',
    address_line1 = 'Unit 2, 1-5 Interchange Drive',
    address_line2 = NULL,
    address_line3 = NULL,
    postal_code = 'NSW 2766',
    phone = '+61 (0)2962 58927',
    email = 'sales@asafeau.com',
    google_maps_url = NULL,
    latitude = -33.80597860,
    longitude = 150.84581290,
    is_default = true,
    sort_order = 1,
    updated_at = now()
WHERE id = '6b9766d9-4c93-4e84-bef3-575f078005ca'
  AND (company_name IS DISTINCT FROM 'A-SAFE Australasia PTY Ltd'
    OR region IS DISTINCT FROM 'Asia Pacific'
    OR country IS DISTINCT FROM 'Australia'
    OR city IS DISTINCT FROM 'Eastern Creek'
    OR address_line1 IS DISTINCT FROM 'Unit 2, 1-5 Interchange Drive'
    OR address_line2 IS DISTINCT FROM NULL
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM 'NSW 2766'
    OR phone IS DISTINCT FROM '+61 (0)2962 58927'
    OR email IS DISTINCT FROM 'sales@asafeau.com'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM -33.80597860
    OR longitude IS DISTINCT FROM 150.84581290
    OR is_default IS DISTINCT FROM true
    OR sort_order IS DISTINCT FROM 1);

-- Japan: A-SAFE K.K. (A-SAFE株式会社), Nara-shi Nijo Ooji Minami 1-2-33, Rena Shin-Omiya Bldg 2F, Nara 630-8012.
UPDATE global_offices
SET company_name = 'A-SAFE K.K. (A-SAFE株式会社)',
    region = 'Asia Pacific',
    country = 'Japan',
    city = 'Nara',
    address_line1 = 'Nara-shi Nijo Ooji Minami 1-2-33',
    address_line2 = 'Rena Shin-Omiya Bldg 2F',
    address_line3 = NULL,
    postal_code = '630-8012',
    phone = '+81 742-32-5180',
    email = 'info@asafe.jp',
    google_maps_url = NULL,
    latitude = 34.68454700,
    longitude = 135.80873400,
    is_default = false,
    sort_order = 2,
    updated_at = now()
WHERE id = '0d960eb1-94ac-4e32-abcd-4a58851b4b64'
  AND (company_name IS DISTINCT FROM 'A-SAFE K.K. (A-SAFE株式会社)'
    OR region IS DISTINCT FROM 'Asia Pacific'
    OR country IS DISTINCT FROM 'Japan'
    OR city IS DISTINCT FROM 'Nara'
    OR address_line1 IS DISTINCT FROM 'Nara-shi Nijo Ooji Minami 1-2-33'
    OR address_line2 IS DISTINCT FROM 'Rena Shin-Omiya Bldg 2F'
    OR address_line3 IS DISTINCT FROM NULL
    OR postal_code IS DISTINCT FROM '630-8012'
    OR phone IS DISTINCT FROM '+81 742-32-5180'
    OR email IS DISTINCT FROM 'info@asafe.jp'
    OR google_maps_url IS DISTINCT FROM NULL
    OR latitude IS DISTINCT FROM 34.68454700
    OR longitude IS DISTINCT FROM 135.80873400
    OR is_default IS DISTINCT FROM false
    OR sort_order IS DISTINCT FROM 2);

-- United Kingdom: A-SAFE HQ Ltd, Habergham Works, Ainleys Industrial Estate, Elland, Halifax, HX5 9JP.
INSERT INTO global_offices (id, office_type, image_url, is_active, company_name, region, country, city, address_line1, address_line2, address_line3, postal_code, phone, email, google_maps_url, latitude, longitude, is_default, sort_order)
VALUES ('8682998c-0927-4b6e-89d1-00ced940d4bd', 'office', 'https://flagcdn.com/w80/gb.png', true, 'A-SAFE HQ Ltd', 'Europe', 'United Kingdom', 'Halifax', 'Habergham Works', 'Ainleys Industrial Estate', 'Elland', 'HX5 9JP', '+44 (0)1422 344402', 'sales@asafe.co.uk', NULL, 53.67754600, -1.83313800, false, 2)
ON CONFLICT (id) DO NOTHING;

-- United Kingdom: A-SAFE International Ltd, Habergham Works, Ainleys Industrial Estate, Elland, Halifax, HX5 9JP.
INSERT INTO global_offices (id, office_type, image_url, is_active, company_name, region, country, city, address_line1, address_line2, address_line3, postal_code, phone, email, google_maps_url, latitude, longitude, is_default, sort_order)
VALUES ('736f69e9-944f-484d-8ce0-e2a5cef14817', 'office', 'https://flagcdn.com/w80/gb.png', true, 'A-SAFE International Ltd', 'International', 'United Kingdom', 'Halifax', 'Habergham Works', 'Ainleys Industrial Estate', 'Elland', 'HX5 9JP', '+44 (0)1422 261661', 'international@asafe.com', NULL, 53.67755740, -1.83392260, false, 1)
ON CONFLICT (id) DO NOTHING;

-- United States: A-SAFE, Sales HQ, 5801 Headquarters Dr, Plano, TX 75024.
INSERT INTO global_offices (id, office_type, image_url, is_active, company_name, region, country, city, address_line1, address_line2, address_line3, postal_code, phone, email, google_maps_url, latitude, longitude, is_default, sort_order)
VALUES ('2d86bbe6-3d3d-44f2-a78f-1b3d35f4028b', 'office', 'https://flagcdn.com/w80/us.png', true, 'A-SAFE, Sales HQ', 'Americas', 'United States', 'Plano', '5801 Headquarters Dr', NULL, NULL, 'TX 75024', '(443) 776 3472', 'sales@asafe.us', NULL, 33.08490846, -96.82226103, false, 2)
ON CONFLICT (id) DO NOTHING;
