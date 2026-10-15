-- Fix the two Middle East rows in global_offices (2026-10-15).
-- scripts/seedOffices.ts had the Riyadh street address on the UAE row and a
-- truncated "Abdullah Al Hamdhani / Al Malaz Dist." on the Saudi row, so the
-- landing page office selector and the Contact page showed the wrong office.
-- Values below match https://www.asafe.com/ar-ae/contact/ and are the same
-- constants shared/offices.ts prints on PDFs, emails and title blocks.
-- Each UPDATE is guarded so a re-run that finds the row already correct is a
-- no-op (updated_at is not bumped twice). The first pair targets the known
-- production ids; the second pair catches any other environment by country.

-- UAE: A-SAFE DWC-LLC, Office 220, Building A5, Dubai South Business Park, Dubai.
UPDATE global_offices
SET company_name = 'A-SAFE UAE',
    city = 'Dubai',
    address_line1 = 'Office 220, Building A5',
    address_line2 = 'Dubai South Business Park',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+971 (4) 8842 422',
    email = 'support@asafe.ae',
    google_maps_url = 'https://maps.app.goo.gl/55wf4FPkAe2NfKDHA',
    updated_at = now()
WHERE id = '8973dcb6-43f6-42a1-a176-65959b36df40'
  AND (address_line1 IS DISTINCT FROM 'Office 220, Building A5'
    OR address_line2 IS DISTINCT FROM 'Dubai South Business Park'
    OR address_line3 IS NOT NULL
    OR phone IS DISTINCT FROM '+971 (4) 8842 422'
    OR email IS DISTINCT FROM 'support@asafe.ae');

-- Saudi Arabia: A-SAFE FOR SAFETY COMPANY, Office 10, 6460 Ibrahim Ibn Mukhalad, Al Malaz District, Riyadh.
UPDATE global_offices
SET company_name = 'A-SAFE Saudi Arabia',
    city = 'Riyadh',
    address_line1 = 'Office 10, 6460 Ibrahim Ibn Mukhalad',
    address_line2 = 'Al Malaz District',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+966 53 397 0866',
    email = 'support@asafe.sa',
    updated_at = now()
WHERE id = '7344ce47-6829-4a3d-9cf3-7bbc26bfe399'
  AND (address_line1 IS DISTINCT FROM 'Office 10, 6460 Ibrahim Ibn Mukhalad'
    OR address_line2 IS DISTINCT FROM 'Al Malaz District'
    OR phone IS DISTINCT FROM '+966 53 397 0866'
    OR email IS DISTINCT FROM 'support@asafe.sa');

-- Safety net by country: any UAE office row still carrying the Riyadh
-- street address (the seed-script shape), whatever its id.
UPDATE global_offices
SET company_name = 'A-SAFE UAE',
    city = 'Dubai',
    address_line1 = 'Office 220, Building A5',
    address_line2 = 'Dubai South Business Park',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+971 (4) 8842 422',
    email = 'support@asafe.ae',
    google_maps_url = 'https://maps.app.goo.gl/55wf4FPkAe2NfKDHA',
    updated_at = now()
WHERE country = 'United Arab Emirates'
  AND office_type = 'office'
  AND (address_line3 = 'Al Malaz District'
    OR address_line1 ILIKE '%Mukhalad%'
    OR address_line2 ILIKE '%Mukhalad%');

-- Safety net by country: any Saudi office row still carrying the truncated
-- seed-script address.
UPDATE global_offices
SET company_name = 'A-SAFE Saudi Arabia',
    city = 'Riyadh',
    address_line1 = 'Office 10, 6460 Ibrahim Ibn Mukhalad',
    address_line2 = 'Al Malaz District',
    address_line3 = NULL,
    postal_code = NULL,
    phone = '+966 53 397 0866',
    email = 'support@asafe.sa',
    updated_at = now()
WHERE country = 'Saudi Arabia'
  AND office_type = 'office'
  AND (address_line1 ILIKE '%Hamdhani%'
    OR address_line2 = 'Al Malaz Dist.');
