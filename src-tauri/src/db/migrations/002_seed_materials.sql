-- Migration 002: Seed wall materials, quick categories, and floor materials
-- Values from docs/architecture/Datenmodell.md Section 3
-- Attenuation values from docs/research/RF-Materialien.md (conservative defaults)

-- 12 core wall materials (W01-W22)
INSERT INTO materials (id, name_de, name_en, category, default_thickness_cm,
    attenuation_24ghz_db, attenuation_5ghz_db, attenuation_6ghz_db,
    is_floor, is_user_defined, is_quick_category, icon) VALUES
-- Light materials
('W01', 'Gipskarton (einfach)',  'Drywall (single)',  'light',  1.25,
     2,   3,   4, 0, 0, 0, 'drywall'),
('W02', 'Gipskarton (doppelt)',  'Drywall (double)',  'light', 10.0,
     5,   7,   9, 0, 0, 0, 'drywall-double'),
('W04', 'Holzstaenderwand',      'Wood stud wall',    'light', 12.0,
     5,   8,  10, 0, 0, 0, 'wood'),
('W05', 'Holztuere (innen)',     'Interior door',     'light',  4.0,
     4,   6,   7, 0, 0, 0, 'door'),
-- Medium materials
('W08', 'Doppelverglasung',      'Double glazing',    'medium', 2.4,
     5,   9,  11, 0, 0, 0, 'window'),
('W11', 'Ziegelwand duenn',      'Thin brick wall',   'medium', 11.5,
     8,  16,  19, 0, 0, 0, 'brick'),
('W12', 'Ziegelwand mittel',     'Medium brick wall', 'medium', 17.5,
    10,  20,  24, 0, 0, 0, 'brick-medium'),
('W14', 'Porenbeton (Ytong)',    'AAC (Ytong)',       'medium', 17.5,
    10,  18,  22, 0, 0, 0, 'aac'),
-- Heavy materials
('W18', 'Beton duenn',           'Thin concrete',     'heavy',  10.0,
    15,  25,  30, 0, 0, 0, 'concrete'),
('W19', 'Beton mittel',          'Medium concrete',   'heavy',  15.0,
    20,  35,  42, 0, 0, 0, 'concrete-medium'),
('W21', 'Stahlbeton',            'Reinforced concrete','heavy', 20.0,
    35,  55,  62, 0, 0, 0, 'concrete-reinforced'),
('W22', 'Metalltuer',            'Metal door',        'heavy',   5.0,
    18,  22,  25, 0, 0, 0, 'metal-door');

-- 3 quick categories (Q01-Q03)
INSERT INTO materials (id, name_de, name_en, category, default_thickness_cm,
    attenuation_24ghz_db, attenuation_5ghz_db, attenuation_6ghz_db,
    is_floor, is_user_defined, is_quick_category, icon) VALUES
('Q01', 'Leichte Wand',  'Light wall',  'light',  10.0,
     4,   6,   8, 0, 0, 1, 'category-light'),
('Q02', 'Mittlere Wand', 'Medium wall', 'medium', 17.5,
    12,  20,  24, 0, 0, 1, 'category-medium'),
('Q03', 'Schwere Wand',  'Heavy wall',  'heavy',  20.0,
    25,  45,  52, 0, 0, 1, 'category-heavy');

-- 4 floor/ceiling materials (F01-F04)
INSERT INTO materials (id, name_de, name_en, category, default_thickness_cm,
    attenuation_24ghz_db, attenuation_5ghz_db, attenuation_6ghz_db,
    is_floor, is_user_defined, is_quick_category, icon) VALUES
('F01', 'Stahlbetondecke (Standard)',    'RC ceiling (standard)',           'heavy', 20.0,
    25,  40,  48, 1, 0, 0, 'floor-concrete'),
('F02', 'Stahlbetondecke + FBH',         'RC ceiling + underfloor heating', 'heavy', 25.0,
    32,  48,  55, 1, 0, 0, 'floor-concrete-fbh'),
('F03', 'Holzbalkendecke',               'Wooden beam ceiling',             'medium', 25.0,
    15,  22,  26, 1, 0, 0, 'floor-wood'),
('F04', 'Stahlbetondecke (komplett)',     'RC ceiling (full buildup)',       'heavy', 30.0,
    35,  55,  62, 1, 0, 0, 'floor-concrete-full');
