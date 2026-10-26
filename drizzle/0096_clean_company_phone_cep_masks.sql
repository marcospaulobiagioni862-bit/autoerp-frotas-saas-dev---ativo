-- Migration 0096: Clean legacy non-numeric characters (masks) from companies table (phone, whatsapp, address_zip_code) (PH-131)

UPDATE companies
SET phone = regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL AND phone ~ '\D';

UPDATE companies
SET whatsapp = regexp_replace(whatsapp, '\D', '', 'g')
WHERE whatsapp IS NOT NULL AND whatsapp ~ '\D';

UPDATE companies
SET address_zip_code = regexp_replace(address_zip_code, '\D', '', 'g')
WHERE address_zip_code IS NOT NULL AND address_zip_code ~ '\D';
