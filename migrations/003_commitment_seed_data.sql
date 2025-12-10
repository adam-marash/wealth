-- Seed commitment data for existing investments
-- Date: 2025-12-10
-- Description: Insert commitment data for 23 investments

-- Update investments with commitment information
UPDATE investments SET
    initial_commitment = 400000,
    committed_currency = 'USD',
    commitment_date = '2019-04-01'
WHERE name = 'Liquidity Capital II, L.P';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2021-10-01'
WHERE name = 'Pollen Street Credit Fund III-USD';

UPDATE investments SET
    initial_commitment = 600000,
    committed_currency = 'USD',
    commitment_date = '2024-01-01'
WHERE name = 'Viola Credit ALF III';

UPDATE investments SET
    initial_commitment = 1000000,
    committed_currency = 'USD',
    commitment_date = '2021-04-01'
WHERE name = 'אימפקט חוב';

UPDATE investments SET
    initial_commitment = 800000,
    committed_currency = 'USD',
    commitment_date = '2020-10-01'
WHERE name = 'קרן המגן - מסלול דולרי';

UPDATE investments SET
    initial_commitment = 250000,
    committed_currency = 'USD',
    commitment_date = '2021-07-01'
WHERE name = 'KDC Media Fund - Stardom Ventures - Stardom Ventures';

UPDATE investments SET
    initial_commitment = 1000000,
    committed_currency = 'USD',
    commitment_date = '2020-07-01'
WHERE name = 'Coller Capital VIII';

UPDATE investments SET
    initial_commitment = 335000,
    committed_currency = 'USD',
    commitment_date = '2022-01-01'
WHERE name = 'ISF - III';

UPDATE investments SET
    initial_commitment = 407701,
    committed_currency = 'USD',
    commitment_date = '2025-07-01'
WHERE name = 'Impact Real Estate FOF';

UPDATE investments SET
    initial_commitment = 600000,
    committed_currency = 'USD',
    commitment_date = '2019-04-01'
WHERE name = 'אלקטרה USA 2';

UPDATE investments SET
    initial_commitment = 600000,
    committed_currency = 'USD',
    commitment_date = '2021-07-01'
WHERE name = 'Faro-Point FRG-X';

UPDATE investments SET
    initial_commitment = 465944,
    committed_currency = 'USD',
    commitment_date = '2022-01-01'
WHERE name = 'Serviced Apartments, Vienna';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2023-07-01'
WHERE name = 'אלקטרה בי. טי. אר 1 - Electra BTR';

UPDATE investments SET
    initial_commitment = 2000000,
    committed_currency = 'ILS',
    commitment_date = '2025-01-01'
WHERE name = 'בית מרס';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2019-07-01'
WHERE name = 'דיור מוגן באטלנטה בוליגו';

UPDATE investments SET
    initial_commitment = 300000,
    committed_currency = 'USD',
    commitment_date = '2020-07-01'
WHERE name = 'דיור מוגן באטלנטה בוליגו 2';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2019-10-01'
WHERE name = 'מגורים Multi-Family בפילדלפיה - גלפנד';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2020-01-01'
WHERE name = 'מגורים Multi-Family ו Single-Family בניו הייבן - נץ';

UPDATE investments SET
    initial_commitment = 594079,
    committed_currency = 'USD',
    commitment_date = '2025-01-01'
WHERE name = 'מגורים וינה 1 - 2025 - Residence Vienna 1';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2020-10-01'
WHERE name = 'מרילנד, Gatewater Landing, גלפנד';

UPDATE investments SET
    initial_commitment = 475000,
    committed_currency = 'USD',
    commitment_date = '2020-07-01'
WHERE name = 'עסקת הרטפורד קונטיקט - התחדשות עירונית';

UPDATE investments SET
    initial_commitment = 500000,
    committed_currency = 'USD',
    commitment_date = '2023-07-01'
WHERE name = 'קאליבר- Caliber';

UPDATE investments SET
    initial_commitment = 600000,
    committed_currency = 'EUR',
    commitment_date = '2019-07-01'
WHERE name = 'ריאליטי גרמניה - רכישת פורטפוליו של סופרמרקטים';

-- Verify commitments were added
SELECT
    name,
    initial_commitment,
    committed_currency,
    commitment_date
FROM investments
WHERE initial_commitment IS NOT NULL
ORDER BY commitment_date;
